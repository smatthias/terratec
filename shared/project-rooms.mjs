import {validateProject} from './project.mjs';
export const MAX_ROOMS=16;
export const roomEntries=project=>project.rooms??[{id:'room-1',name:'Room 1',room:project.room}];
export const activeRoomId=project=>project.activeRoomId??'room-1';
export const activeRoomName=project=>roomEntries(project).find(r=>r.id===activeRoomId(project)).name;
// Use this for every active-room edit: update both copies before validation.
export function withActiveRoom(project,room) {
  return {...project,schemaVersion:project.rooms?Math.max(10,project.schemaVersion):9,room,...(project.rooms?{rooms:project.rooms.map(entry=>entry.id===project.activeRoomId?{...entry,room}:entry)}:{})};
}
function assemble(project,rooms,id) {
  const active=rooms.find(r=>r.id===id);
  if(!active) throw Error('Unknown room');
  return validateProject({...project,schemaVersion:Math.max(10,project.schemaVersion),rooms,activeRoomId:id,room:active.room});
}
export function switchProjectRoom(input,id) {
  const project=validateProject(input);
  if(id===activeRoomId(project)) return project;
  return assemble(project,roomEntries(project),id);
}
export function addProjectRoom(input,{id,name}) {
  const project=validateProject(input),rooms=roomEntries(project);
  if(rooms.length>=MAX_ROOMS) throw Error('A project supports up to 16 rooms');
  const room=validateProject({schemaVersion:1,units:'m',name:'New room',room:{width:6,depth:4,height:2.8}}).room;
  return assemble(project,[...rooms,{id,name,room}],id);
}
export function renameProjectRoom(input,id,name) {
  const project=validateProject(input),rooms=roomEntries(project);
  if(!rooms.some(r=>r.id===id)) throw Error('Unknown room');
  return assemble(project,rooms.map(r=>r.id===id?{...r,name}:r),activeRoomId(project));
}

export function setProjectRoomPlacement(input,id,placement) {
  const project=validateProject(input),rooms=roomEntries(project);
  if(!rooms.some(r=>r.id===id)) throw Error('Unknown room');
  return assemble({...project,schemaVersion:Math.max(11,project.schemaVersion)},rooms.map(r=>r.id===id?{...r,placement}:r),activeRoomId(project));
}
