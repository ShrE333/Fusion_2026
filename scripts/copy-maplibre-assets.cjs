const fs = require('node:fs');
const path = require('node:path');
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'));
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
const destination = path.resolve(__dirname, '../public/vendor/maplibre-gl');
// Validate the complete installed pair before copying either file.
for (const name of files) {
  const file = path.join(packageRoot, 'dist', name);
  // 6.13's worker is standalone; its published shared module is legitimately empty.
  // Copy that exact companion rather than fabricating a replacement module.
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || (name === 'maplibre-gl-worker.mjs' && fs.statSync(file).size === 0)) {
    throw new Error(`Installed MapLibre asset missing or invalid: ${name}`);
  }
}
fs.mkdirSync(destination, {recursive:true});
for (const name of files) fs.copyFileSync(path.join(packageRoot, 'dist', name), path.join(destination, name));
console.log(`Copied matching MapLibre ${require(path.join(packageRoot, 'package.json')).version} worker assets`);
