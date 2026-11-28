export const NATIVE_RESOURCE_DEFAULTS=Object.freeze({maxTriangles:2000000,maxLogicalCpuMeshBytes:67108864});
export function nativeResourceCheck(triangles,input={}) {
 if(!Number.isSafeInteger(triangles)||triangles<1||triangles>2000000)throw Error('Native triangle count exceeds the reviewed parser limit');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(NATIVE_RESOURCE_DEFAULTS,k)))throw Error('Unsupported native resource budget fields');
 const limits={...NATIVE_RESOURCE_DEFAULTS,...input};for(const [key,value] of Object.entries(limits))if(!Number.isSafeInteger(value)||value<1||value>(key==='maxTriangles'?2000000:4294967296))throw Error('Native resource limits must be positive bounded integer counts/bytes');
 // import_obj expands every triangle corner to a MeshVertex (96 bytes on the reviewed ABI).
 const usage={triangles,importedVertices:triangles*3,vertexStrideBytes:96,indexStrideBytes:4,vertexBytes:triangles*3*96,indexBytes:triangles*3*4,logicalCpuMeshBytes:triangles*3*100};
 const exceeded=[];if(triangles>limits.maxTriangles)exceeded.push('triangles');if(usage.logicalCpuMeshBytes>limits.maxLogicalCpuMeshBytes)exceeded.push('logicalCpuMeshBytes');
 return {status:exceeded.length?'blocked':'within-budget',limits,usage,exceeded,utilization:{trianglesPercent:Number((triangles/limits.maxTriangles*100).toFixed(2)),logicalCpuMeshPercent:Number((usage.logicalCpuMeshBytes/limits.maxLogicalCpuMeshBytes*100).toFixed(2))},scope:'Logical retained OBJ mesh payload on the reviewed x86_64 ABI; excludes allocation overhead, parser peak memory, textures, GPU resources and framebuffers.'};
}
function scopedElement(e) {
 let parts;try{parts=JSON.parse(e.elementId);}catch{throw Error('Invalid scoped source element ID');}
 if(!Array.isArray(parts)||!parts.every(p=>typeof p==='string')||!parts[0]?.startsWith('room-')||!(['floor','ceiling'].includes(parts[1])&&parts.length===2||['wall','furniture'].includes(parts[1])&&parts.length===3))throw Error('Invalid scoped source element ID');
 if(e.kind!==(parts[1]==='furniture'?'furniture-bounds':parts[1])||e.roomId!==undefined&&e.roomId!==parts[0]||e.wallId!==undefined&&e.wallId!==parts[2]||e.furnitureId!==undefined&&e.furnitureId!==parts[2])throw Error('Source element metadata disagrees with scoped ID');
 return parts;
}
export function traceNativeTriangle(manifest,index) {
 if(manifest?.format!=='terratec-native-viewer-adapter'||manifest.version!==1||!Array.isArray(manifest.elements)||manifest.elements.length<1||manifest.elements.length>4096||!Number.isSafeInteger(manifest.summary?.triangles)||manifest.summary.triangles<1||manifest.summary.triangles>2000000||manifest.summary.elements!==manifest.elements.length)throw Error('Invalid native source-range manifest');
 let next=0;const ids=new Set();for(const e of manifest.elements){if(!Number.isSafeInteger(e.firstTriangle)||e.firstTriangle!==next||!Number.isSafeInteger(e.triangleCount)||e.triangleCount<1||typeof e.elementId!=='string'||ids.has(e.elementId))throw Error('Native source ranges must be unique, contiguous and complete');scopedElement(e);ids.add(e.elementId);next+=e.triangleCount;if(!Number.isSafeInteger(next))throw Error('Invalid native source range');}
 if(next!==manifest.summary.triangles)throw Error('Native source ranges do not cover the exported mesh');
 if(!Number.isSafeInteger(index)||index<0||index>=next)throw Error('Choose a zero-based triangle from 0 to '+(next-1));
 const e=manifest.elements.find(e=>index>=e.firstTriangle&&index<e.firstTriangle+e.triangleCount);const parts=scopedElement(e);
 return {triangleIndex:index,objFace:index+1,nativeNode:1,asset:'terratec-model',elementId:e.elementId,roomId:parts[0],kind:e.kind,...(parts[1]==='wall'?{wallId:parts[2]}:{}),...(parts[1]==='furniture'?{furnitureId:parts[2]}:{}),localTriangle:index-e.firstTriangle,materialRef:e.materialRef??null};
}
