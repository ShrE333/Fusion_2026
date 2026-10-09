/** Node 20+ production checks (no credentials printed or required).
 * node scripts/smoke-geosathi-production.mjs
 */
const site=(process.env.GEOSATHI_SITE_URL||'https://geosathi-atlas.vercel.app').replace(/\/+$/,'');
const segmentation=(process.env.SEGMENTATION_API_URL||'https://geosathi-segmentation-api-883668519860.asia-south1.run.app').replace(/\/+$/,'');
async function probe(name,url,options={},parse=true){
  try {
    const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000),cache:'no-store'});
    let body={};if(parse)body=await r.json().catch(()=>({error:'Unexpected response format'}));
    console.log(`${r.ok?'PASS':'FAIL'} ${name}: HTTP ${r.status}${body.search_meta?` source=${body.search_meta.source} results=${body.results?.length||0} issue=${body.search_meta.issue||'-'}`:body.configured!==undefined?` configured=${body.configured}`:body.error?` error=${body.error}`:body.status?` status=${body.status}`:''}`);
    return {ok:r.ok,status:r.status,body};
  }catch(e){console.log(`FAIL ${name}: connection/timeout (${e.name||'Error'})`);return {ok:false};}
}
const api=`${site}/api/skyclip/search`;
const post=(query)=>probe(`GIS/Sentinel: ${query}`,api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,center:{lat:18.5204,lon:73.8567}})});
const checks = await Promise.all([
  probe('Site homepage',site,{},false),
  probe('MapLibre worker',`${site}/vendor/maplibre-gl/maplibre-gl-worker.mjs`,{},false),
  post('Find hospitals near me'),
  post('Find hotels near me'),
  post('Find cafes near me'),
  post('Find open land within 500 m'),
  probe('Mapillary lookup',`${site}/api/mapillary/images?lat=18.5204&lon=73.8567`),
  probe('Segmentation service health',`${segmentation}/health`),
  probe('Detection proxy',`${site}/api/street-detection`),
]);
console.log('\nA 503 from Mapillary means MAPILLARY_ACCESS_TOKEN is missing; a 503/502 from Sentinel indicates credentials, quota or processing errors.');
console.log('Check 3D Mapillary interactively (NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN + real Mapillary coverage).');
console.log('Detection requires actual Mapillary image ID; Mask2Former is 2D semantic segmentation, not 3D meshes.');

const failed = checks.filter(check => !check.ok);
if (failed.length) { console.error(`${failed.length} production checks failed or require configuration.`); process.exitCode = 1; } else { console.log("All HTTP checks responded successfully; interactive UI/inference still requires browser verification."); }
