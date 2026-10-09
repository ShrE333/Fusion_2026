/** Run in the GeoSathi repository: node scripts/test-street-detection.cjs */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.resolve(__dirname,'../src/app/api/street-detection/route.ts');
const compiled = ts.transpileModule(fs.readFileSync(file,'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}, reportDiagnostics:true,
});
assert.equal(compiled.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
const mod={exports:{}};
new Function('module','exports','require','process','fetch','FormData','Blob','AbortSignal','URL','Response',compiled.outputText)(
  mod,mod.exports,name=>name==='next/server'?{NextResponse:{json:(x,opts)=>Response.json(x,opts)}}:require(name),process,
  (...args)=>global.fetch(...args),FormData,Blob,AbortSignal,URL,Response
);
const {POST,GET}=mod.exports;
const ORIGINAL={fetch:global.fetch,map:process.env.MAPILLARY_ACCESS_TOKEN,api:process.env.SEGMENTATION_API_URL};
const req=(imageId)=>new Request('https://example.test/api/street-detection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageId})});
const reset=()=>{global.fetch=ORIGINAL.fetch;for(const [key,value] of [['MAPILLARY_ACCESS_TOKEN',ORIGINAL.map],['SEGMENTATION_API_URL',ORIGINAL.api]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}};

test('invalid image IDs are rejected before making provider requests',async()=>{
  global.fetch=async()=>{throw Error('Unexpected provider fetch')};
  try{for(const id of ['https://169.254.169.254/latest','foo','123',null])assert.equal((await POST(req(id))).status,422);}finally{reset();}
});
test('not configured returns explicit 503',async()=>{
  delete process.env.MAPILLARY_ACCESS_TOKEN;
  try{assert.equal((await POST(req('123456789'))).status,503);assert.equal((await GET()).status,200);}finally{reset();}
});
test('authenticated Mapillary image resolves to Cloud Run multipart inference',async()=>{
  process.env.MAPILLARY_ACCESS_TOKEN='test-token';process.env.SEGMENTATION_API_URL='https://segmentation.test';
  const urls=[];
  global.fetch=async(url,opts)=>{
    urls.push(String(url));
    if(String(url).startsWith('https://graph.mapillary.com/')){assert.equal(opts.headers.Authorization,'OAuth test-token');return Response.json({id:'123456789',thumb_1024_url:'https://scontent.cdn.fbcdn.net/test.jpg'});}
    if(String(url).startsWith('https://scontent.'))return new Response(Uint8Array.from([255,216,255]),{status:200,headers:{'Content-Type':'image/jpeg'}});
    assert.equal(url,'https://segmentation.test/segment'); assert.equal(opts.method,'POST');
    assert.ok(opts.body instanceof FormData);
    return Response.json({overlay_png_base64:'YWJjZA==',classes:[{class_id:1,label:'road',pixel_percentage:54.3}],inference_ms:143});
  };
  try{const res=await POST(req('123456789'));const payload=await res.json(); assert.equal(res.status,200);assert.equal(payload.classes[0].label,'road');assert.equal(payload.overlayBase64,'YWJjZA==');assert.equal(urls.length,3);assert.ok(!JSON.stringify(payload).includes('test-token'));}finally{reset();}
});
test('untrusted image host is blocked (prevents arbitrary SSRF)',async()=>{
  process.env.MAPILLARY_ACCESS_TOKEN='test-token';
  global.fetch=async()=>Response.json({id:'123456789',thumb_1024_url:'http://127.0.0.1/admin'});
  try{assert.equal((await POST(req('123456789'))).status,502);}finally{reset();}
});
test('provider failure does not fabricate detection',async()=>{
  process.env.MAPILLARY_ACCESS_TOKEN='test-token';
  global.fetch=async()=>new Response('',{status:503});
  try{const res=await POST(req('123456789'));assert.equal(res.status,502);const data=await res.json();assert.ok(!('overlayBase64' in data));}finally{reset();}
});
