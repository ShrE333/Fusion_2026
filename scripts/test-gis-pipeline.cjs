const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => name === 'next/server' ? { NextResponse: { json: Response.json } } :
    name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) :
    name.startsWith('.') ? load(path.relative(root,path.resolve(root,path.dirname(relative),path.extname(name)?name:`${name}.ts`))) : require(name);
  new Function('require', 'exports', code)(localRequire, exports);
  cache.set(relative, exports);
  return exports;
}
const service = load('src/lib/server/geoai-search.ts');
const { isGeoGeometry } = load('src/lib/geo-validation.ts');
const center = { lat: 18.5204, lon: 73.8567 };
const bbox = service.regionFor(center);
const polygon = { type: 'Polygon', coordinates: [[[73.85,18.52],[73.86,18.52],[73.86,18.53],[73.85,18.53],[73.85,18.52]]] };
async function configured(run) {
  const saved = { fetch: global.fetch, gis: process.env.GEOSATHI_API_BASE_URL, model: process.env.SKYCLIP_BASE_URL, token: process.env.SKYCLIP_SERVICE_TOKEN };
  process.env.GEOSATHI_API_BASE_URL = 'https://gis.example.test';
  process.env.SKYCLIP_BASE_URL = 'https://model.example.test';
  process.env.SKYCLIP_SERVICE_TOKEN = 'test-only-token';
  try { await run(); } finally {
    global.fetch = saved.fetch;
    for (const [key, value] of [['GEOSATHI_API_BASE_URL',saved.gis],['SKYCLIP_BASE_URL',saved.model],['SKYCLIP_SERVICE_TOKEN',saved.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
test('reject malformed, nonfinite, unclosed and out-of-range GeoJSON', () => {
  assert.equal(isGeoGeometry(polygon), true);
  assert.equal(isGeoGeometry({ type:'MultiPolygon', coordinates:[polygon.coordinates] }), true);
  for (const geometry of [ {type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]}, {type:'Point',coordinates:[181,0]}, {type:'LineString',coordinates:[[0,0]]}, {type:'Point',coordinates:[NaN,0]} ]) assert.equal(isGeoGeometry(geometry), false);
  assert.equal(service.validCenter({lat:'',lon:true}), null);
  assert.equal(service.validCenter({lat:null,lon:73}), null);
});
test('building query retains polygons, OSM references and export provenance inside the requested area', () => configured(async () => {
  global.fetch = async url => {
    const u = new URL(url); assert.equal(u.searchParams.get('layer'), 'buildings');
    assert.equal(Number(u.searchParams.get('west')), bbox[0]);
    return Response.json({type:'FeatureCollection',features:[{id:42,properties:{building:'yes'},geometry:polygon},{id:43,geometry:{type:'Point',coordinates:[77,13]}},{id:44,geometry:{type:'Polygon',coordinates:[[[0,0]]]}}]});
  };
  const out = await service.searchGeoSathi('buildings nearby', center);
  assert.equal(out.source,'gis'); assert.equal(out.response.results.length,1);
  assert.deepEqual(out.response.results[0].geometry,polygon);
  assert.equal(out.response.results[0].osmFeatures[0].osmId,'42');
  assert.match(out.response.export.features[0].properties.source,/OpenStreetMap/);
}));
test('hospital queries exclude unrelated places; unpaved roads exclude paved roads', () => configured(async () => {
  global.fetch = async url => Response.json({type:'FeatureCollection', features: new URL(url).searchParams.get('layer') === 'places' ? [
    {id:1,properties:{amenity:'hospital'},geometry:polygon}, {id:2,properties:{amenity:'school'},geometry:polygon},
  ] : [{id:3,properties:{surface:'asphalt'},geometry:polygon},{id:4,properties:{surface:'gravel'},geometry:polygon}]});
  for (const query of ['hospitals nearby','रुग्णालय जवळ','अस्पताल nearby']) {
    const out = await service.searchGeoSathi(query,center); assert.equal(out.response.results.length,1); assert.equal(out.response.results[0].id,'osm:places:1');
  }
  const roads = await service.searchGeoSathi('unpaved roads nearby',center);
  assert.equal(roads.response.results.length,1); assert.equal(roads.response.results[0].id,'osm:roads:4');
}));
test('SkyCLIP fallback never returns out-of-area tiles or invalid scores', () => configured(async () => {
  global.fetch = async (url,options) => {
    if (url.startsWith('https://gis')) return Response.json({type:'FeatureCollection',features:[]});
    assert.deepEqual(JSON.parse(options.body).bbox,bbox);
    assert.equal(options.headers.Authorization,'Bearer test-only-token');
    return Response.json({results:[{tile_id:'local',bbox:[73.85,18.52,73.86,18.53],similarity:0.8},{tile_id:'other-city',bbox:[77,13,77.01,13.01],similarity:0.9},null,{tile_id:'bad',bbox:[73.85,18.52,73.86,18.53],similarity:null}]});
  };
  const out = await service.searchGeoSathi('buildings nearby',center);
  assert.equal(out.source,'skyclip'); assert.equal(out.response.results.length,1);
  assert.equal(out.response.results[0].id,'tile:local'); assert.match(out.response.results[0].evidence,/not a verified/);
}));
test('frontend and WhatsApp routes use the same service with explicit authentication and input failures', () => configured(async () => {
  global.fetch = async () => Response.json({type:'FeatureCollection',features:[{id:42,geometry:polygon,properties:{building:'yes'}}]});
  const browser = load('src/app/api/skyclip/search/route.ts').POST;
  const whatsapp = load('src/app/api/infra-search/route.ts').POST;
  const req = (body,token) => new Request('https://atlas.example.test/search',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  assert.equal((await whatsapp(req({query:'buildings',location:center}))).status,401);
  assert.equal((await browser(req({query:'buildings',center:{lat:99,lon:73}}))).status,422);
  assert.equal((await browser(req(null))).status,422);
  const a = await (await browser(req({query:'buildings',center}))).json();
  const b = await (await whatsapp(req({query:'buildings',location:center},'test-only-token'))).json();
  assert.deepEqual(a.results[0].geometry,b.results[0].geometry);
  assert.deepEqual(a.search_meta.search_bbox,b.search_bbox);
}));
