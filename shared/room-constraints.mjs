import {assertUnlocked} from './room-lock.mjs';
import {cornerIds,cornerPoint,cornerWalls,wallIds,wallSegment,wallCorners,cornerIndex} from './room-topology.mjs';

export const CONSTRAINT_TOLERANCE=1e-6;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function validateConstraints(raw,room,checkGeometry=true) {
  if(raw===undefined) return undefined;
  if(!Array.isArray(raw)||raw.length>64) throw Error('Room supports up to 64 constraints');
  const corners=new Set(cornerIds(room)),walls=new Set(wallIds(room)),seen=new Set();
  const result=raw.map(c=>{
    if(!c||!['point','length','parallel','perpendicular'].includes(c.type)) throw Error('Unknown room constraint type');
    const angular=['parallel','perpendicular'].includes(c.type);
    const pair=angular?[c.wall,c.other].sort():null;
    const key=angular?'angle:'+pair.join(':'):c.type+':'+(c.type==='point'?c.corner:c.wall);
    if(seen.has(key)) throw Error('Duplicate room constraint');seen.add(key);
    if(c.type==='point') {
      if(!corners.has(c.corner)||![c.x,c.z].every(v=>finite(v)&&Math.abs(v)<=1000)) throw Error('Locked point needs a valid corner and coordinates within ±1000 m');
      return {type:'point',corner:c.corner,x:c.x,z:c.z};
    }
    if(angular) {
      if(!walls.has(c.wall)||!walls.has(c.other)||c.wall===c.other) throw Error('Choose two different existing walls');
      return {type:c.type,wall:pair[0],other:pair[1]};
    }
    if(!walls.has(c.wall)||!finite(c.length)||c.length<.1||c.length>Math.SQRT2*1000) throw Error('Fixed length needs a valid wall and length');
    return {type:'length',wall:c.wall,length:c.length};
  });
  if(checkGeometry) assertConstraints({...room,constraints:result});
  return result.length?result:undefined;
}
const ruleKey=c=>c.type+':'+(c.type==='point'?c.corner:c.other?[c.wall,c.other].sort().join(':'):c.wall);
export function constraintDiagnostics(room){return (room.constraints??[]).map(c=>{
 let residual;if(c.type==='point'){const p=cornerPoint(room,c.corner);residual=Math.hypot(p.x-c.x,p.z-c.z);}else{const a=wallSegment(room,c.wall);if(c.type==='length')residual=Math.abs(a.length-c.length);else{const b=wallSegment(room,c.other);residual=a.length<1e-12||b.length<1e-12?Infinity:Math.abs(c.type==='parallel'?a.tx*b.tz-a.tz*b.tx:a.tx*b.tx+a.tz*b.tz);}}
 residual=Number.isFinite(residual)?residual:Infinity;
 const walls=c.type==='point'?Object.values(cornerWalls(room,c.corner)):c.other?[c.wall,c.other]:[c.wall];
 return {key:ruleKey(c),constraint:{...c},residual,unit:c.other?'normalized':'m',walls,satisfied:residual<=CONSTRAINT_TOLERANCE};
});}
export function constraintResidual(room){return Math.max(0,...constraintDiagnostics(room).map(row=>row.residual));}
function failure(message,room,outline,pinned,code,focus=null,iterations=0){
 const rows=constraintDiagnostics({...room,outline}).filter(row=>!row.satisfied||row.constraint.type==='point'||row.key===(focus&&ruleKey(focus))),affectedWalls=[...new Set([...rows.flatMap(row=>row.walls),...pinned.flatMap(corner=>Object.values(cornerWalls(room,corner)))])];
 const error=new Error(message);error.constraintDiagnostic={code,iterations,tolerance:CONSTRAINT_TOLERANCE,rows,affectedWalls,pinnedCorners:[...pinned]};return error;
}
export function assertConstraints(room) {
  if(constraintResidual(room)>CONSTRAINT_TOLERANCE) throw failure('Room edit violates saved geometry constraints',room,room.outline,[],'saved-constraint-violation');
}
// Bounded projection: explicitly edited corners and locked points stay fixed.
// The caller validates convexity, openings and furniture before committing.
export function solveConstraints(room,outline,pinned=[]) {
  const constraints=validateConstraints(room.constraints,room,false);
  if(!constraints) return outline.map(p=>({...p}));
  const next=outline.map(p=>({...p})),fixed=new Set(pinned.map(id=>cornerIndex(room,id)));
  for(const c of constraints.filter(c=>c.type==='point')) {
    const i=cornerIndex(room,c.corner);
    if(fixed.has(i)&&Math.hypot(next[i].x-c.x,next[i].z-c.z)>CONSTRAINT_TOLERANCE) throw failure('Cannot move a locked point',room,next,pinned,'locked-point',c);
    next[i]={x:c.x,z:c.z};fixed.add(i);
  }
  const lengths=constraints.filter(c=>c.type==='length').map(c=>{const ends=wallCorners(room,c.wall);return {...c,a:cornerIndex(room,ends.a),b:cornerIndex(room,ends.b)};});
  const angles=constraints.filter(c=>c.other).map(c=>{
    const a=wallCorners(room,c.wall),b=wallCorners(room,c.other);
    return {...c,ids:[a.a,a.b,b.a,b.b].map(id=>cornerIndex(room,id))};
  });
  for(let iteration=0;iteration<256;iteration++) {
    for(const c of lengths) {
      const a=next[c.a],b=next[c.b],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),freeA=!fixed.has(c.a),freeB=!fixed.has(c.b),count=Number(freeA)+Number(freeB);
      if(Math.abs(d-c.length)<=CONSTRAINT_TOLERANCE*.1) continue;
      if(!count||d<1e-12) throw failure('Fixed wall length conflicts with edited or locked points',room,next,pinned,'fixed-length',c,iteration+1);
      const correction=(d-c.length)/d/count;
      if(freeA) {a.x+=dx*correction;a.z+=dz*correction;}
      if(freeB) {b.x-=dx*correction;b.z-=dz*correction;}
    }
    for(const c of angles) {
      const [a,b,d,e]=c.ids.map(i=>next[i]),u={x:b.x-a.x,z:b.z-a.z},v={x:e.x-d.x,z:e.z-d.z};
      const parallel=c.type==='parallel',f=parallel?u.x*v.z-u.z*v.x:u.x*v.x+u.z*v.z;
      const scale=Math.hypot(u.x,u.z)*Math.hypot(v.x,v.z);
      if(scale<1e-12) throw failure('Angle constraint collapsed a wall',room,next,pinned,'collapsed-angle',c,iteration+1);
      if(Math.abs(f)/scale<=CONSTRAINT_TOLERANCE*.1) continue;
      const gu=parallel?{x:v.z,z:-v.x}:v,gv=parallel?{x:-u.z,z:u.x}:u,gradients=new Map();
      c.ids.forEach((id,i)=>{
        const g=i<2?gu:gv,sign=i%2?1:-1,old=gradients.get(id)??{x:0,z:0};
        gradients.set(id,{x:old.x+sign*g.x,z:old.z+sign*g.z});
      });
      const free=[...gradients].filter(([id])=>!fixed.has(id)),norm=free.reduce((n,[,g])=>n+g.x*g.x+g.z*g.z,0);
      if(norm<1e-20) throw failure('Wall angle conflicts with edited or locked points',room,next,pinned,'fixed-angle',c,iteration+1);
      for(const [id,g] of free) {next[id].x-=f*g.x/norm;next[id].z-=f*g.z/norm;}
    }
    if(constraintResidual({...room,outline:next})<=CONSTRAINT_TOLERANCE) return next;
  }
  throw failure('Constraints did not converge within 256 iterations; room unchanged',room,next,pinned,'iteration-limit',null,256);
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

export function setAngleConstraint(room,wall,other,type) {
  assertUnlocked(room,'change wall angles');
  if(!['parallel','perpendicular',null].includes(type)) throw Error('Unknown wall relationship');
  wallSegment(room,wall);wallSegment(room,other);
  if(wall===other) throw Error('Choose two different existing walls');
  const constraints=(room.constraints??[]).filter(c=>!c.other||![wall,other].includes(c.wall)||![wall,other].includes(c.other));
  if(type) constraints.push({type,wall,other});
  const next={...room,constraints:validateConstraints(constraints,room,false)??[]};
  return {...next,outline:solveConstraints(next,next.outline)};
}
