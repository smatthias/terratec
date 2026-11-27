import {roomWalls,wallLabel} from './room-topology.mjs';
import {placedRoomPoint,roomFootprint,footprintsOverlap} from './room-placement.mjs';
export const ADJACENCY_TOLERANCE=1e-5;
const ANGLE_TOLERANCE=1e-7;
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const along=(wall,p)=>(p.x-wall.a.x)*wall.tx+(p.z-wall.a.z)*wall.tz;
function worldWalls(entry) {
  return roomWalls(entry.room).map(wall=>{
    const a=placedRoomPoint(wall.a,entry.placement),b=placedRoomPoint(wall.b,entry.placement),length=Math.hypot(b.x-a.x,b.z-a.z);
    return {id:wall.id,a,b,length,tx:(b.x-a.x)/length,tz:(b.z-a.z)/length};
  });
}
function match(a,b) {
  if(a.tx*b.tx+a.tz*b.tz>=0||Math.abs(a.tx*b.tz-a.tz*b.tx)>ANGLE_TOLERANCE) return null;
  const distance=(wall,p)=>Math.abs((p.x-wall.a.x)*wall.tz-(p.z-wall.a.z)*wall.tx);
  if(distance(a,b.a)>ADJACENCY_TOLERANCE||distance(a,b.b)>ADJACENCY_TOLERANCE||distance(b,a.a)>ADJACENCY_TOLERANCE||distance(b,a.b)>ADJACENCY_TOLERANCE) return null;
  const lo=Math.max(0,Math.min(along(a,b.a),along(a,b.b))),hi=Math.min(a.length,Math.max(along(a,b.a),along(a,b.b)));
  if(hi-lo<=ADJACENCY_TOLERANCE) return null;
  const at=t=>({x:a.a.x+a.tx*t,z:a.a.z+a.tz*t}),start=at(lo),end=at(hi);
  const bLo=Math.max(0,Math.min(along(b,start),along(b,end))),bHi=Math.min(b.length,Math.max(along(b,start),along(b,end)));
  return {start,end,length:hi-lo,a:{from:lo,to:hi},b:{from:bLo,to:bHi}};
}
// Derived candidates only: no topology, openings or manufacturing data is changed.
// Stable pair ordering also makes keys independent of the collection's UI order.
export function roomAdjacencies(entries) {
  const rooms=entries.map(entry=>({...entry,footprint:roomFootprint(entry),segments:worldWalls(entry)})).sort(byId),result=[];
  for(let i=0;i<rooms.length;i++) for(let j=i+1;j<rooms.length;j++) {
    const a=rooms[i],b=rooms[j];
    if(footprintsOverlap(a.footprint,b.footprint)) continue;
    for(const wa of a.segments) for(const wb of b.segments) {
      const span=match(wa,wb);if(!span) continue;
      const side=(entry,wall,interval)=>({roomId:entry.id,roomName:entry.name,wallId:wall.id,wallName:wallLabel(wall.id),...interval});
      result.push({id:a.id+':'+wa.id+'|'+b.id+':'+wb.id,...span,a:side(a,wa,span.a),b:side(b,wb,span.b),height:Math.min(a.room.height,b.room.height),heightMismatch:Math.abs(a.room.height-b.room.height)>ADJACENCY_TOLERANCE});
    }
  }
  return result.sort(byId);
}
