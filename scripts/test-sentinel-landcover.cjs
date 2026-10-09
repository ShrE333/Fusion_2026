'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const {deflateSync}=require('node:zlib');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const cached=new Map();
function load(file){
 if(cached.has(file))return cached.get(file);
 const src=fs.readFileSync(path.join(root,file),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={}; cached.set(file,exports);
 const localRequire=name=>name.startsWith('./')?load(path.posix.normalize(path.posix.join(path.posix.dirname(file),name+'.ts'))):require(name);
 new Function('require','exports','Buffer','process',code)(localRequire,exports,Buffer,process);
 return exports;
}
const core=load('src/lib/server/landcover-core.ts');
const png=load('src/lib/server/sentinel-png.ts');
const service=load('src/lib/server/sentinel-landcover.ts');
const center={lat:18.5204,lon:73.8567};
test('natural language categories, radius and area extraction',()=>{
 assert.equal(core.parseLandcoverQuery('find hospitals near me'),null);
 assert.deepEqual(core.parseLandcoverQuery('find empty spaces within 500m'),{kind:'open',radiusM:500,minimumAreaM2:400});
 assert.deepEqual(core.parseLandcoverQuery('Find open plots larger than 2000 m2 within 1 km'),{kind:'open',radiusM:1000,minimumAreaM2:2000});
 assert.equal(core.parseLandcoverQuery('rivers within 300m').kind,'water');
 assert.equal(core.parseLandcoverQuery('find emply spaces with 500m').radiusM,500);
 assert.equal(core.parseLandcoverQuery('forests within 1 km').kind,'forest');
 assert.throws(()=>core.parseLandcoverQuery('forest within 10km'),/radius/);
});
test('clusters preserve classified grid cell polygons and exclude off-radius pixels',()=>{
 const width=10,height=10,values=new Uint8Array(100);
 for(let y=4;y<6;y++)for(let x=4;x<6;x++)values[y*width+x]=10;
 values[0]=40;
 const out=core.extractCandidates(values,width,height,[73.85,18.515,73.86,18.525],center,{kind:'open',radiusM:500,minimumAreaM2:200});
 assert.equal(out.length,1);assert.equal(out[0].pixels,4);assert.equal(out[0].geometry.type,'MultiPolygon');
 assert.ok(out[0].areaM2>200);assert.ok(out[0].geometry.coordinates.length>=1);
});
function chunk(name,payload){let b=Buffer.alloc(payload.length+12);b.writeUInt32BE(payload.length,0);b.write(name,4,'ascii');payload.copy(b,8);return b;}
function mockPng(width,height,color=30){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){let p=y*(width*4+1)+1+x*4;raw[p]=color;raw[p+3]=255;}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
test('PNG classification decoding and bounds',()=>{
 const a=png.decodeClassificationPng(mockPng(2,2,40));assert.equal(a.width,2);assert.deepEqual([...a.pixels],[40,40,40,40]);
 assert.throws(()=>png.decodeClassificationPng(Buffer.from('hello')),/invalid PNG/);
});
test('missing Sentinel Hub credentials never fabricates spatial results',async()=>{
 const saveId=process.env.SENTINEL_HUB_CLIENT_ID,saveSecret=process.env.SENTINEL_HUB_CLIENT_SECRET;
 delete process.env.SENTINEL_HUB_CLIENT_ID;delete process.env.SENTINEL_HUB_CLIENT_SECRET;
 try{await assert.rejects(()=>service.searchSentinelLandcover('find forest within 500m',center),/set SENTINEL_HUB_CLIENT_ID/);}
 finally{if(saveId!==undefined)process.env.SENTINEL_HUB_CLIENT_ID=saveId;if(saveSecret!==undefined)process.env.SENTINEL_HUB_CLIENT_SECRET=saveSecret;}
});
test('mocked OAuth and Sentinel Process API yield GeoJSON candidates',async()=>{
 const saveId=process.env.SENTINEL_HUB_CLIENT_ID,saveSecret=process.env.SENTINEL_HUB_CLIENT_SECRET,saveFetch=global.fetch;
 process.env.SENTINEL_HUB_CLIENT_ID='test-id';process.env.SENTINEL_HUB_CLIENT_SECRET='test-secret';
 let calls=0;global.fetch=async (url,options)=>{
   calls++;
   if(url.includes('openid-connect/token')){assert.equal(options.method,'POST');return Response.json({access_token:'unit-token',expires_in:3600});}
   assert.match(url,/\/api\/v1\/process$/);const body=JSON.parse(options.body);
   assert.equal(body.input.data[0].type,'sentinel-2-l2a');assert.equal(body.output.width,100);
   return new Response(mockPng(body.output.width,body.output.height,30),{headers:{'content-type':'image/png'}});
 };
 try{
   const out=await service.searchSentinelLandcover('find forests within 500m',center);
   assert.ok(out.response.results.length>0);assert.equal(out.response.results[0].geometry.type,'MultiPolygon');
   assert.equal(out.response.export.type,'FeatureCollection');assert.equal(calls,2);
 }finally{global.fetch=saveFetch;if(saveId===undefined)delete process.env.SENTINEL_HUB_CLIENT_ID;else process.env.SENTINEL_HUB_CLIENT_ID=saveId;if(saveSecret===undefined)delete process.env.SENTINEL_HUB_CLIENT_SECRET;else process.env.SENTINEL_HUB_CLIENT_SECRET=saveSecret;}
});
