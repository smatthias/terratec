import {assertUnlocked} from './room-lock.mjs';
import {cornerIds,cornerPoint,wallIds,wallSegment,wallCorners,cornerIndex} from './room-topology.mjs';

export const CONSTRAINT_TOLERANCE=1e-6;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function validateConstraints(raw,room,checkGeometry=true) {
  if(raw===undefined) return undefined;
  if(!Array.isArray(raw)||raw.length>64) throw Error('Room supports up to 64 constraints');
  const corners=new Set(cornerIds(room)),walls=new Set(wallIds(room)),seen=new Set();
  const result=raw.map(c=>{
    if(!c||!['point','length'].includes(c.type)) throw Error('Unknown room constraint type');
    const key=c.type+':'+(c.type==='point'?c.corner:c.wall);
    if(seen.has(key)) throw Error('Duplicate room constraint');seen.add(key);
    if(c.type==='point') {
      if(!corners.has(c.corner)||![c.x,c.z].every(v=>finite(v)&&Math.abs(v)<=1000)) throw Error('Locked point needs a valid corner and coordinates within ±1000 m');
      return {type:'point',corner:c.corner,x:c.x,z:c.z};
    }
    if(!walls.has(c.wall)||!finite(c.length)||c.length<.1||c.length>Math.SQRT2*1000) throw Error('Fixed length needs a valid wall and length');
    return {type:'length',wall:c.wall,length:c.length};
  });
  if(checkGeometry) assertConstraints({...room,constraints:result});
  return result.length?result:undefined;
}
export function constraintResidual(room) {
  return Math.max(0,...(room.constraints??[]).map(c=>c.type==='point'?
    Math.hypot(cornerPoint(room,c.corner).x-c.x,cornerPoint(room,c.corner).z-c.z):
    Math.abs(wallSegment(room,c.wall).length-c.length)));
}
export function assertConstraints(room) {
  if(constraintResidual(room)>CONSTRAINT_TOLERANCE) throw Error('Room edit violates locked points or fixed wall lengths');
}
// Bounded projection: explicitly edited corners and locked points stay fixed.
// The caller validates convexity, openings and furniture before committing.
export function solveConstraints(room,outline,pinned=[]) {
  const constraints=validateConstraints(room.constraints,room,false);
  if(!constraints) return outline.map(p=>({...p}));
  const next=outline.map(p=>({...p})),fixed=new Set(pinned.map(id=>cornerIndex(room,id)));
  for(const c of constraints.filter(c=>c.type==='point')) {
    const i=cornerIndex(room,c.corner);
    if(fixed.has(i)&&Math.hypot(next[i].x-c.x,next[i].z-c.z)>CONSTRAINT_TOLERANCE) throw Error('Cannot move a locked point');
    next[i]={x:c.x,z:c.z};fixed.add(i);
  }
  const lengths=constraints.filter(c=>c.type==='length').map(c=>{const ends=wallCorners(room,c.wall);return {...c,a:cornerIndex(room,ends.a),b:cornerIndex(room,ends.b)};});
  for(let iteration=0;iteration<256;iteration++) {
    for(const c of lengths) {
      const a=next[c.a],b=next[c.b],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),freeA=!fixed.has(c.a),freeB=!fixed.has(c.b),count=Number(freeA)+Number(freeB);
      if(Math.abs(d-c.length)<=CONSTRAINT_TOLERANCE*.1) continue;
      if(!count||d<1e-12) throw Error('Fixed wall length conflicts with edited or locked points');
      const correction=(d-c.length)/d/count;
      if(freeA) {a.x+=dx*correction;a.z+=dz*correction;}
      if(freeB) {b.x-=dx*correction;b.z-=dz*correction;}
    }
    if(constraintResidual({...room,outline:next})<=CONSTRAINT_TOLERANCE) return next;
  }
  throw Error('Constraints did not converge within 256 iterations; room unchanged');
}
export function togglePointConstraint(room,corner) {
  assertUnlocked(room,'change point constraints');cornerPoint(room,corner);
  const constraints=[...(room.constraints??[])],i=constraints.findIndex(c=>c.type==='point'&&c.corner===corner);
  if(i>=0) constraints.splice(i,1);else constraints.push({type:'point',corner,...cornerPoint(room,corner)});
  return {...room,constraints};
}
export function setLengthConstraint(room,wall,length) {
  assertUnlocked(room,'change length constraints');
  wallSegment(room,wall);
  const constraints=(room.constraints??[]).filter(c=>!(c.type==='length'&&c.wall===wall));
  if(length!==null) constraints.push({type:'length',wall,length});
  const next={...room,constraints};validateConstraints(constraints,next,false);
  return {...next,outline:solveConstraints(next,next.outline)};
}
