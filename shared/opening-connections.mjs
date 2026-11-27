import {roomAdjacencies,ADJACENCY_TOLERANCE} from './room-adjacency.mjs';
import {wallSegment} from './room-topology.mjs';
import {placedRoomPoint} from './room-placement.mjs';
const near=(a,b)=>Math.abs(a-b)<=ADJACENCY_TOLERANCE;
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(id);
export const mirroredHinge=value=>value==='A'?'B':'A';
export const mirroredSwing=value=>value==='in'?'out':'in';
export function validateOpeningConnections(raw,rooms) {
  if(raw===undefined) return undefined;
  if(!Array.isArray(raw)||raw.length>64) throw Error('Projects support up to 64 opening connections');
  if(!raw.length) return undefined;
  const ids=new Set(),used=new Set(),byRoom=new Map(rooms.map(r=>[r.id,r])),adjacencies=roomAdjacencies(rooms);
  return raw.map(link=>{
    if(!link||!validId(link.id)||ids.has(link.id)) throw Error('Opening connection IDs must be unique');ids.add(link.id);
    const endpoints=[link.a,link.b].map(side=>{
      if(!side||!validId(side.openingId)||typeof side.roomId!=='string') throw Error('Connection needs room and opening IDs');
      const room=byRoom.get(side.roomId),opening=room?.room.openings.find(o=>o.id===side.openingId);
      if(!opening) throw Error('Connected opening is missing; unlink before removing it');
      const key=side.roomId+':'+side.openingId;if(used.has(key)) throw Error('An opening can have only one connection');used.add(key);
      return {room,opening,ref:{roomId:side.roomId,openingId:side.openingId}};
    }).sort((a,b)=>a.room.id<b.room.id?-1:1);
    const [a,b]=endpoints;if(a.room.id===b.room.id) throw Error('Connected openings must belong to different rooms');
    const span=adjacencies.find(c=>c.a.roomId===a.room.id&&c.b.roomId===b.room.id&&c.a.wallId===a.opening.wall&&c.b.wallId===b.opening.wall);
    const error='Connected openings no longer align; unlink before editing their geometry or room placement';
    if(!span) throw Error(error);
    const fits=(o,side)=>o.offset>=side.from-ADJACENCY_TOLERANCE&&o.offset+o.width<=side.to+ADJACENCY_TOLERANCE;
    if(a.opening.type!==b.opening.type||!['width','height','sill'].every(k=>near(a.opening[k],b.opening[k]))||!near(a.opening.sill+a.opening.height,b.opening.sill+b.opening.height)||!fits(a.opening,span.a)||!fits(b.opening,span.b)||!near(b.opening.offset,span.b.to-(a.opening.offset-span.a.from)-a.opening.width)||!near(b.opening.offset+b.opening.width,span.b.to-(a.opening.offset-span.a.from))) throw Error(error);
    if(a.opening.type==='door'&&(b.opening.hinge!==mirroredHinge(a.opening.hinge)||b.opening.swing!==mirroredSwing(a.opening.swing))) throw Error('Connected doors need mirrored hinge and swing; unlink before changing them');
    return {id:link.id,a:a.ref,b:b.ref};
  });
}
export function openingConnectionSegments(rooms,links=[]) {
  return links.map(link=>{
    const entry=rooms.find(r=>r.id===link.a.roomId),other=rooms.find(r=>r.id===link.b.roomId),opening=entry.room.openings.find(o=>o.id===link.a.openingId),wall=wallSegment(entry.room,opening.wall);
    const at=t=>placedRoomPoint({x:wall.a.x+wall.tx*t,z:wall.a.z+wall.tz*t},entry.placement);
    return {id:link.id,type:opening.type,label:entry.name+' ↔ '+other.name+' · '+opening.type,start:at(opening.offset),end:at(opening.offset+opening.width)};
  });
}
