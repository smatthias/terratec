import {validateProject} from './project.mjs';
import {roomAdjacencies,ADJACENCY_TOLERANCE} from './room-adjacency.mjs';
import {mirroredHinge,mirroredSwing} from './opening-connections.mjs';
import {assertUnlocked} from './room-lock.mjs';
export function connectRoomOpening(input,{candidateId,sourceRoomId,openingId,id,pairedOpeningId}) {
  const project=validateProject(input),span=roomAdjacencies(project.rooms??[]).find(c=>c.id===candidateId);
  if(!span) throw Error('Shared-wall candidate no longer exists');
  const side=span.a.roomId===sourceRoomId?span.a:span.b.roomId===sourceRoomId?span.b:null;
  if(!side) throw Error('Source room is not part of this shared wall');
  const target=side===span.a?span.b:span.a,source=project.rooms.find(r=>r.id===sourceRoomId),destination=project.rooms.find(r=>r.id===target.roomId);
  assertUnlocked(source.room,'connect openings');assertUnlocked(destination.room,'connect openings');
  const opening=source.room.openings.find(o=>o.id===openingId&&o.wall===side.wallId);
  if(!opening) throw Error('Choose an opening on the source wall');
  if(opening.offset<side.from-ADJACENCY_TOLERANCE||opening.offset+opening.width>side.to+ADJACENCY_TOLERANCE) throw Error('Opening must lie entirely within the shared span');
  const expected={...opening,id:pairedOpeningId,wall:target.wallId,offset:target.to-(opening.offset-side.from)-opening.width,...(opening.type==='door'?{hinge:mirroredHinge(opening.hinge),swing:mirroredSwing(opening.swing)}:{})};
  const aligned=destination.room.openings.find(o=>o.wall===expected.wall&&o.type===expected.type&&['offset','width','height','sill'].every(k=>Math.abs(o[k]-expected[k])<=ADJACENCY_TOLERANCE));
  if(aligned&&opening.type==='door'&&(aligned.hinge!==expected.hinge||aligned.swing!==expected.swing)) throw Error('Matching target door has incompatible hinge/swing; adjust it before connecting');
  const paired=aligned??expected;
  const rooms=project.rooms.map(entry=>entry.id===target.roomId&&!aligned?{...entry,room:{...entry.room,openings:[...entry.room.openings,paired]}}:entry);
  return validateProject({...project,schemaVersion:12,rooms,room:rooms.find(r=>r.id===project.activeRoomId).room,openingLinks:[...(project.openingLinks??[]),{id,a:{roomId:sourceRoomId,openingId:opening.id},b:{roomId:target.roomId,openingId:paired.id}}]});
}
export function unlinkRoomOpening(input,id) {
  const project=validateProject(input);
  if(!(project.openingLinks??[]).some(link=>link.id===id)) throw Error('Opening connection no longer exists');
  return validateProject({...project,openingLinks:project.openingLinks.filter(link=>link.id!==id)});
}
