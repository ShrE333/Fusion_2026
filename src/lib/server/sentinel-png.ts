import { inflateSync } from "node:zlib";
/** Minimal, bounded PNG decoder for Sentinel Hub's 8-bit RGB(A) categorical raster. */
export function decodeClassificationPng(input: Buffer): {width:number;height:number;pixels:Uint8Array} {
  if(input.length<45||input.length>6_000_000||input.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw new Error("Satellite provider returned invalid PNG bytes");
  let width=0,height=0,channels=0;
  const idats:Buffer[]=[];
  for(let offset=8;offset+12<=input.length;){
    const n=input.readUInt32BE(offset), end=offset+12+n;
    if(n>6_000_000||end>input.length)throw new Error("Malformed satellite PNG chunk");
    const type=input.toString("ascii",offset+4,offset+8),payload=input.subarray(offset+8,offset+8+n);
    if(type==="IHDR"){
      if(n!==13)throw new Error("Malformed satellite PNG header");
      width=payload.readUInt32BE(0);height=payload.readUInt32BE(4);
      const depth=payload[8], color=payload[9];
      channels=color===6?4:color===2?3:0;
      if(depth!==8||!channels||payload[12]!==0||width<1||height<1||width*height>80000)throw new Error("Unsupported satellite PNG encoding");
    }
    if(type==="IDAT")idats.push(payload);
    offset=end;
    if(type==="IEND")break;
  }
  if(!channels||idats.length===0)throw new Error("Incomplete satellite PNG");
  const stride=width*channels;
  const bytes=inflateSync(Buffer.concat(idats),{maxOutputLength:height*(stride+1)+4});
  if(bytes.length!==height*(stride+1))throw new Error("Satellite PNG dimensions mismatch");
  const result=new Uint8Array(width*height), previous=new Uint8Array(stride),row=new Uint8Array(stride);
  for(let y=0;y<height;y++){
    const offset=y*(stride+1), filter=bytes[offset];
    for(let i=0;i<stride;i++){
      const v=bytes[offset+1+i], left=i<channels?0:row[i-channels], up=previous[i], upperLeft=i<channels?0:previous[i-channels];
      let predictor=0;
      if(filter===1)predictor=left;
      else if(filter===2)predictor=up;
      else if(filter===3)predictor=Math.floor((left+up)/2);
      else if(filter===4){const p=left+up-upperLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upperLeft);predictor=pa<=pb&&pa<=pc?left:pb<=pc?up:upperLeft;}
      else if(filter!==0)throw new Error("Unknown satellite PNG scanline filter");
      row[i]=(v+predictor)&255;
    }
    for(let x=0;x<width;x++)result[y*width+x]=channels===4&&row[x*channels+3]<128?0:row[x*channels];
    previous.set(row);
  }
  return {width,height,pixels:result};
}
