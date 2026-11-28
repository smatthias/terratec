import {wallCorners} from './room-topology.mjs';
import {moveCorners,snapPoint,bounds} from './geometry.mjs';
function checkedPoints(room,request){
 if(!request||request.type!=='endpoints'||Object.keys(request).some(k=>!['type','wall','points'].includes(k))||!Array.isArray(request.points)||request.points.length!==2)throw Error('Expected a captured two-endpoint edit');
 const expected=Object.values(wallCorners(room,request.wall));
 if(new Set(request.points.map(p=>p?.corner)).size!==2||request.points.some(p=>!p||!expected.includes(p.corner)||Object.keys(p).some(k=>!['corner','x','z'].includes(k))||![p.x,p.z].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000)))throw Error('Endpoint request needs both wall corners and finite coordinates within ±1000 m');
 return expected.map(corner=>({...request.points.find(p=>p.corner===corner)}));
}
export function captureEndpointRequest(room,wall,points,spacing,snapEnabled){
 if(!Array.isArray(points)||points.length!==2||points.some(p=>!p||typeof p!=='object')||typeof snapEnabled!=='boolean')throw Error('Expected endpoint drafts and a snap setting');
 const request={type:'endpoints',wall,points:points.map(p=>({corner:p.corner,...snapPoint(p,spacing,snapEnabled)}))};request.points=checkedPoints(room,request);return request;
}
export function endpointRequestRoom(room,request){
 const points=checkedPoints(room,request),moves=Object.fromEntries(points.map(({corner,x,z})=>[corner,{x,z}])),outline=moveCorners(room,moves,1,false),size=bounds(outline);
 return {...room,outline,width:size.width,depth:size.depth};
}
