// Deterministic, uncompressed ZIP for small portable adapter bundles.
const encoder=new TextEncoder();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function storedZip(files) {
 if(!Array.isArray(files)||files.length<1||files.length>16)throw Error('ZIP needs 1–16 files');
 const names=new Set(),entries=files.map(file=>{if(typeof file.name!=='string'||file.name.length>200||file.name.split('/').some(p=>!p||p==='.'||p==='..'||!/^[A-Za-z0-9_.-]+$/.test(p))||names.has(file.name)||typeof file.content!=='string')throw Error('Unsafe or duplicate ZIP entry');names.add(file.name);return {name:encoder.encode(file.name),data:encoder.encode(file.content)};});
 if(entries.reduce((s,e)=>s+e.data.length,0)>33554432)throw Error('Adapter ZIP exceeds 32 MiB');
 const parts=[],directory=[];let offset=0;
 const header=(size)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
 for(const e of entries){const crc=crc32(e.data),local=header(30),v=local.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,e.data.length,true);v.setUint32(22,e.data.length,true);v.setUint16(26,e.name.length,true);parts.push(local.bytes,e.name,e.data);
  const central=header(46),c=central.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,e.data.length,true);c.setUint32(24,e.data.length,true);c.setUint16(28,e.name.length,true);c.setUint32(42,offset,true);directory.push(central.bytes,e.name);offset+=30+e.name.length+e.data.length;
 }
 const directorySize=directory.reduce((s,p)=>s+p.length,0),end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,directorySize,true);v.setUint32(16,offset,true);parts.push(...directory,end.bytes);const result=new Uint8Array(offset+directorySize+22);let i=0;for(const part of parts){result.set(part,i);i+=part.length;}return result;
}
// Read only this adapter's canonical stored-ZIP profile, never extract to disk.
export const MAX_ADAPTER_ZIP_BYTES=33554432+8192;
export function readStoredZip(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>MAX_ADAPTER_ZIP_BYTES)throw Error('Adapter ZIP size or byte input is invalid');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true}),files=[];let offset=0,total=0;
 while(offset+4<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
  if(files.length>=16||offset+30>bytes.length)throw Error('Invalid adapter ZIP local header');
  const size=view.getUint32(offset+18,true),unpacked=view.getUint32(offset+22,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength;
  total+=size;if(view.getUint16(offset+6,true)!==0||view.getUint16(offset+8,true)!==0||extra!==0||size!==unpacked||nameLength<1||nameLength>200||total>33554432||start+size>bytes.length)throw Error('Unsupported or truncated adapter ZIP entry');
  const data=bytes.subarray(start,start+size);if(crc32(data)!==view.getUint32(offset+14,true))throw Error('Adapter ZIP CRC mismatch');
  try{files.push({name:decoder.decode(bytes.subarray(offset+30,start)),content:decoder.decode(data)});}catch{throw Error('Adapter ZIP requires valid UTF-8 text');}offset=start+size;
 }
 const canonical=storedZip(files);if(canonical.length!==bytes.length||canonical.some((b,i)=>b!==bytes[i]))throw Error('Adapter ZIP directory or canonical headers mismatch');
 return files;
}
