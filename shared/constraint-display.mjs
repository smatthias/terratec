import {cornerLabel,cornerWalls,wallLabel,wallSegment,cornerPoint} from './room-topology.mjs';
import {assertUnlocked} from './room-lock.mjs';

export function constraintKey(c) {
  return c.type+':'+(c.type==='point'?c.corner:c.other?[c.wall,c.other].sort().join(':'):c.wall);
}
// IDs follow persisted identities; C numbers are transient references for this list.
export function constraintRows(room) {
  return (room.constraints??[]).map((c,index)=>{
    const id='C'+(index+1),key=constraintKey(c);
    if(c.type==='point') return {id,key,label:cornerLabel(c.corner)+' locked at '+c.x.toFixed(3)+', '+c.z.toFixed(3)+' m',symbol:'lock',wall:cornerWalls(room,c.corner).outgoing,anchors:[{key:c.corner,...cornerPoint(room,c.corner),point:true}]};
    const walls=c.other?[c.wall,c.other]:[c.wall],symbol=c.type==='length'?'='+c.length.toFixed(2)+' m':c.type==='parallel'?'∥':'⊥';
    const label=c.type==='length'?wallLabel(c.wall)+' fixed at '+c.length.toFixed(3)+' m':walls.map(wallLabel).join(c.type==='parallel'?' parallel to ':' perpendicular to ');
    return {id,key,label,symbol,wall:c.wall,anchors:walls.map(wall=>{const {a,b}=wallSegment(room,wall);return {key:wall,x:(a.x+b.x)/2,z:(a.z+b.z)/2};})};
  });
}
export function removeConstraint(room,key) {
  assertUnlocked(room,'remove constraints');
  if(!(room.constraints??[]).some(c=>constraintKey(c)===key)) throw Error('Constraint no longer exists');
  const constraints=room.constraints.filter(c=>constraintKey(c)!==key);
  const {constraints:_old,...rest}=room;
  return constraints.length?{...rest,constraints}:rest;
}
