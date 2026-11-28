import {traceNativeTriangle} from './native-resource-budget.mjs';
export function nativeElementMetrics(scene,manifest,elementId){
 const entry=manifest?.elements?.find(e=>e.elementId===elementId);if(!entry)throw Error('Choose a verified source element to measure');
 traceNativeTriangle(manifest,entry.firstTriangle);
 const mesh=[...(scene?.surfaces??[]),...(scene?.bodies??[])].find(m=>m.id===elementId);
 if(!mesh||!Array.isArray(mesh.positions)||mesh.positions.length<9||mesh.positions.length%3||!mesh.positions.every(Number.isFinite)||!Array.isArray(mesh.indices)||mesh.indices.length!==entry.triangleCount*3||!mesh.indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<mesh.positions.length/3))throw Error('Source geometry cannot be measured');
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity},axes=['x','y','z'];
 for(let i=0;i<mesh.positions.length;i++) {const axis=axes[i%3];min[axis]=Math.min(min[axis],mesh.positions[i]);max[axis]=Math.max(max[axis],mesh.positions[i]);}
 let area=0;for(let i=0;i<mesh.indices.length;i+=3){const a=mesh.indices[i]*3,b=mesh.indices[i+1]*3,c=mesh.indices[i+2]*3,ux=mesh.positions[b]-mesh.positions[a],uy=mesh.positions[b+1]-mesh.positions[a+1],uz=mesh.positions[b+2]-mesh.positions[a+2],vx=mesh.positions[c]-mesh.positions[a],vy=mesh.positions[c+1]-mesh.positions[a+1],vz=mesh.positions[c+2]-mesh.positions[a+2];area+=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/2;}
 const spans=Object.fromEntries(axes.map(axis=>[axis,max[axis]-min[axis]])),centre=Object.fromEntries(axes.map(axis=>[axis,(min[axis]+max[axis])/2]));if(!Number.isFinite(area)||![...Object.values(spans),...Object.values(centre)].every(Number.isFinite))throw Error('Source measurements exceed finite numeric limits');
 return {elementId,units:'m',frame:'project-local Y-up',bounds:{min,max},axisAlignedSpans:spans,centre,triangulatedArea:area,approximation:entry.kind==='furniture-bounds',triangleRange:{first:entry.firstTriangle,endExclusive:entry.firstTriangle+entry.triangleCount,count:entry.triangleCount}};
}
