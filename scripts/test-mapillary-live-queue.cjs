const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = file => {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',js)((name)=>name==='next/server'?{NextResponse:{json:Response.json}}:require(name),exports);
  return exports;
};
const queue = load('src/lib/street-inference-queue.ts');
const route = load('src/app/api/street-detection/route.ts');
const request = () => new Request('https://geo.example.test/api/street-detection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageId:'123456789'})});
async function withProvider(run){
  const saved = {fetch:global.fetch, token:process.env.MAPILLARY_ACCESS_TOKEN,seg:process.env.SEGMENTATION_API_URL};
  process.env.MAPILLARY_ACCESS_TOKEN='test-value-only';
  delete process.env.SEGMENTATION_API_URL;
  try{await run();}finally{global.fetch=saved.fetch;if(saved.token===undefined)delete process.env.MAPILLARY_ACCESS_TOKEN;else process.env.MAPILLARY_ACCESS_TOKEN=saved.token;if(saved.seg===undefined)delete process.env.SEGMENTATION_API_URL;else process.env.SEGMENTATION_API_URL=saved.seg;}
}
test('live queue uses a stable frame debounce and min request gap',()=>{
  assert.equal(queue.queueDelayMs(100000,0,0,15),1400);
  assert.equal(queue.queueDelayMs(100000,99000,0,15),14000);
  assert.equal(queue.queueDelayMs(100000,0,165000,15),65000);
  assert.equal(queue.intervalSeconds(0),10);
  assert.equal(queue.intervalSeconds(600),30);
});
test('Retry-After duration and HTTP date are bounded',()=>{
  assert.equal(queue.retryAfterMs('20',100000),20000);
  assert.equal(queue.retryAfterMs('1',100000),15000);
  assert.equal(queue.retryAfterMs('5000',100000),300000);
  assert.equal(queue.retryAfterMs('Thu, 01 Jan 1970 00:02:00 GMT',100000),20000);
  assert.equal(queue.retryAfterMs('invalid',100000),60000);
});
test('Mapillary metadata HTTP 429 survives detection proxy with Retry-After',()=>withProvider(async()=>{
  global.fetch=async url=>{ assert.match(String(url),/graph\.mapillary\.com/);return new Response('',{status:429,headers:{'Retry-After':'45'}}); };
  const r=await route.POST(request()); assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'45');
}));
test('Mapillary image CDN 429 survives with bounded cooldown',()=>withProvider(async()=>{
  global.fetch=async url=>String(url).includes('graph.mapillary.com') ? Response.json({id:'123456789',thumb_1024_url:'https://scontent.fbcdn.net/frame.jpg'}) : new Response('',{status:429,headers:{'Retry-After':'1200'}});
  const r=await route.POST(request());assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'300');
}));
test('Mask2Former 429 survives with Retry-After',()=>withProvider(async()=>{
  global.fetch=async (url)=>{
    if(String(url).includes('graph.mapillary.com'))return Response.json({id:'123456789',thumb_1024_url:'https://scontent.fbcdn.net/frame.jpg'});
    if(String(url).includes('scontent.fbcdn.net'))return new Response(Buffer.from([0xff,0xd8,0xff,0xd9]),{status:200,headers:{'Content-Type':'image/jpeg'}});
    return new Response('',{status:429,headers:{'Retry-After':'25'}});
  };
  const r=await route.POST(request());assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'25');
}));
test('component is scope-limited: follows images without changing the 3D viewer',()=>{
  const component=fs.readFileSync(path.join(root,'src/components/street-view/street-segmentation-overlay.tsx'),'utf8');
  assert.match(component,/Follow Mapillary images/);
  assert.match(component,/inFlight/);
  assert.match(component,/cache|cached/);
  assert.doesNotMatch(component,/new MapillaryViewerClass|new maplibregl\.Map/);
});
