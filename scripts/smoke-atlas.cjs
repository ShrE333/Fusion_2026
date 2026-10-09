const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const base = process.argv[2] || 'http://127.0.0.1:3000';
async function check(route, options) {
  try {
    const response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(65000) });
    const json = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    console.log(JSON.stringify({ route, status: response.status, source: json?.search_meta?.source, resultCount: json?.results?.length, searchStatus: json?.status }));
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ route, failure: error.name })); process.exitCode = 1;
  }
}
(async () => {
  for (const route of ['/inspect?lat=18.5204&lon=73.8567&q=hospitals', '/street-view', '/layers']) await check(route);
  await check('/api/skyclip/search', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'hospitals nearby',center:{lat:18.5204,lon:73.8567}})});
  const token = process.env.SKYCLIP_SERVICE_TOKEN;
  if (token) await check('/api/infra-search', {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({query:'hospitals nearby',location:{lat:18.5204,lon:73.8567}})});
  else console.log(JSON.stringify({route:'/api/infra-search',blocked:'No local service credential available; authenticated smoke test skipped'}));
})();
