import {cabinetFootprint} from './furniture.mjs';
import {edgeIds} from './geometry.mjs';
export function clearanceSettings(input={}){
  const minWall=input.minWall??.05,doorDepth=input.doorDepth??.6,enforce=input.enforce??false;
  if(![minWall,doorDepth].every(v=>typeof v==='number'&&Number.isFinite(v))||minWall<0||minWall>2||doorDepth<0||doorDepth>3||typeof enforce!=='boolean')throw Error('Clearance settings need wall gap 0–2 m and door depth 0–3 m');
  return {minWall,doorDepth,enforce};
}
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const sub=(a,b)=>({x:a.x-b.x,z:a.z-b.z});
function closest(p,a,b){const v=sub(b,a),t=Math.max(0,Math.min(1,((p.x-a.x)*v.x+(p.z-a.z)*v.z)/(v.x*v.x+v.z*v.z)));return {x:a.x+t*v.x,z:a.z+t*v.z};}
function segmentDistance(a,b,c,d){
 const r=sub(b,a),s=sub(d,c),den=cross(r,s);
 if(Math.abs(den)>1e-12){const t=cross(sub(c,a),s)/den,u=cross(sub(c,a),r)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+t*r.x,z:a.z+t*r.z};return {distance:0,from:p,to:p};}}
 return [{from:a,to:closest(a,c,d)},{from:b,to:closest(b,c,d)},{from:closest(c,a,b),to:c},{from:closest(d,a,b),to:d}].map(p=>({...p,distance:Math.hypot(p.from.x-p.to.x,p.from.z-p.to.z)})).sort((a,b)=>a.distance-b.distance)[0];
}
function intersects(a,b){
 for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],axis={x:-(q.z-p.z),z:q.x-p.x};
  const project=points=>points.map(v=>v.x*axis.x+v.z*axis.z),pa=project(a),pb=project(b);
  if(Math.max(...pa)<=Math.min(...pb)+1e-9||Math.max(...pb)<=Math.min(...pa)+1e-9)return false;
 }return true;
}
export function furnitureClearance(room,item,options){
 const settings=clearanceSettings(options),body=cabinetFootprint(item),walls=[];
 for(let i=0;i<room.outline.length;i++){
  const a=room.outline[i],b=room.outline[(i+1)%room.outline.length];let nearest;
  for(let n=0;n<body.length;n++){const result=segmentDistance(body[n],body[(n+1)%body.length],a,b);if(!nearest||result.distance<nearest.distance)nearest=result;}
  walls.push({wall:edgeIds[i],...nearest});
 }
 const nearestWall=[...walls].sort((a,b)=>a.distance-b.distance)[0],issues=[],zones=[];
 for(const wall of walls)if(wall.distance<settings.minWall-1e-8)issues.push({code:'WALL_GAP',wall:wall.wall,message:`${wall.wall} wall gap ${wall.distance.toFixed(3)} m is below ${settings.minWall.toFixed(3)} m`});
 for(const opening of room.openings??[]){
  if(item.height<=opening.sill+1e-9)continue;
  const index=edgeIds.indexOf(opening.wall),a=room.outline[index],b=room.outline[(index+1)%room.outline.length],length=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/length,tz=(b.z-a.z)/length,nx=-tz,nz=tx;
  const depth=opening.type==='door'?Math.max(settings.doorDepth,opening.swing==='out'?0:opening.width):.15;
  if(depth<=0)continue;
  const point=(along,inward)=>({x:a.x+along*tx+inward*nx,z:a.z+along*tz+inward*nz});
  const polygon=[point(opening.offset,0),point(opening.offset+opening.width,0),point(opening.offset+opening.width,depth),point(opening.offset,depth)];
  if(intersects(body,polygon)){
   zones.push({openingId:opening.id,polygon});
   issues.push({code:opening.type==='door'?'DOOR_ZONE':'WINDOW_ZONE',openingId:opening.id,wall:opening.wall,message:opening.type==='door'?`Cabinet enters ${opening.wall} door access/swing planning zone`:`Cabinet enters ${opening.wall} window service planning zone`});
  }
 }
 return {nearestWall,walls,issues,zones,settings};
}
