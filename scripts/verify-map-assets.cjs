const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
(async () => {
  for (const name of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs']) {
    const expected = fs.readFileSync(path.join(packageRoot,'dist',name));
    const copied = fs.readFileSync(path.resolve(__dirname,'../public/vendor/maplibre-gl',name));
    if (hash(expected)!==hash(copied)) throw new Error(`Copied asset mismatch: ${name}`);
    console.log(`PASS installed/copy byte match: ${name}`);
    if (process.argv[2]) {
      const response = await fetch(new URL(`/vendor/maplibre-gl/${name}`,process.argv[2]),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const type = response.headers.get('content-type') || '';
      const bytes = Buffer.from(await response.arrayBuffer());
      if(!response.ok||!/javascript/.test(type)||hash(bytes)!==hash(expected)) throw new Error(`HTTP asset mismatch: ${name}, status ${response.status}, type ${type}`);
      console.log(`PASS HTTP ${response.status} ${type}, installed byte match: ${name}`);
    }
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
