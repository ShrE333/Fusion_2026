const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(file){
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',code)(name=>name==='next/server'?{NextResponse:{json:Response.json}}:name==='@/lib/api/mapillary'?load('src/lib/api/mapillary.ts'):require(name),exports);
  return exports;
}
const {GET}=load('src/app/api/mapillary/images/route.ts');
const request=(query='lat=18.5204&lon=73.8567')=>new Request('https://atlas.example.test/api/mapillary/images?'+query);
const secret='private-test-token';
async function mocked(fn){
  const oldFetch=global.fetch,oldToken=process.env.MAPILLARY_ACCESS_TOKEN;
  process.env.MAPILLARY_ACCESS_TOKEN=secret;
  try{await fn();}finally{global.fetch=oldFetch;if(oldToken===undefined)delete process.env.MAPILLARY_ACCESS_TOKEN;else process.env.MAPILLARY_ACCESS_TOKEN=oldToken;}
}
test('invalid locations fail before provider calls and absent private token returns 503',()=>mocked(async()=>{
  global.fetch=()=>{throw Error('must not fetch');};
  for(const q of ['','lat=&lon=1','lat=91&lon=1','lat=1&lon=181','lat=Infinity&lon=1'])assert.equal((await GET(request(q))).status,422);
  delete process.env.MAPILLARY_ACCESS_TOKEN;
  assert.equal((await GET(request())).status,503);
}));
test('fixed lookup area, server auth, count cap and out-of-area rejection',()=>mocked(async()=>{
  global.fetch=async(url,options)=>{
    const u=new URL(url);assert.equal(u.hostname,'graph.mapillary.com');assert.equal(u.searchParams.get('limit'),'40');
    assert.equal(options.headers.Authorization,'OAuth '+secret);
    const b=u.searchParams.get('bbox').split(',').map(Number);assert.ok(b[2]-b[0]<0.02&&b[3]-b[1]<0.02);
    return Response.json({data:[{id:'outside',computed_geometry:{type:'Point',coordinates:[77,13]}},...Array.from({length:60},(_,i)=>({id:String(i),computed_geometry:{type:'Point',coordinates:[73.8567,18.5204]}}))],paging:{token:secret}});
  };
  const response=await GET(request('lat=18.5204&lon=73.8567&limit=9999&bbox=-180,-90,180,90'));
  const body=await response.json();assert.ok(body.data.length>0&&body.data.length<=40);assert.ok(!JSON.stringify(body).includes(secret));assert.ok(body.data.every(x=>x.id!=='outside'));
}));
test('provider auth, 404, rate-limit and unavailable errors are sanitized',()=>mocked(async()=>{
  for(const [status,expected] of [[401,401],[403,403],[404,200],[429,429],[500,502]]){
    global.fetch=async()=>Response.json({error:secret},{status});
    const response=await GET(request());assert.equal(response.status,expected);
    const body=await response.text();assert.ok(!body.includes(secret));if(status===404)assert.deepEqual(JSON.parse(body).data,[]);
  }
}));
test('timeouts, malformed data and echoed credentials never leak provider content',()=>mocked(async()=>{
  global.fetch=async()=>{throw new DOMException(secret,'TimeoutError');};assert.equal((await GET(request())).status,504);
  global.fetch=async()=>Response.json({data:'malformed'});assert.equal((await GET(request())).status,502);
  global.fetch=async()=>Response.json({data:[{id:secret,computed_geometry:{type:'Point',coordinates:[73.8567,18.5204]}}]});
  const response=await GET(request());assert.equal(response.status,502);assert.ok(!(await response.text()).includes(secret));
}));
test('browser lookup calls same-origin API without credentials',async()=>{
  const saved=global.fetch;
  global.fetch=async(url,options)=>{assert.ok(url.startsWith('/api/mapillary/images?'));assert.equal(options.headers,undefined);return Response.json({data:[]});};
  try{assert.deepEqual(await load('src/lib/api/mapillary.ts').searchMapillaryImages([73.8567,18.5204],new AbortController().signal),[]);}finally{global.fetch=saved;}
});
