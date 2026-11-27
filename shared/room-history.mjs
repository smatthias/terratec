import {createHistory,undoHistory,redoHistory} from './history.mjs';
import {validateProject} from './project.mjs';
import {activeRoomId,withActiveRoom} from './project-rooms.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
export function createRoomHistories() {
  const rooms=new Map();
  return {
    remember(project,history) {rooms.set(activeRoomId(project),copy(history));},
    load(project) {
      const saved=rooms.get(activeRoomId(project));
      return saved&&JSON.stringify(saved.present)===JSON.stringify(project.room)?copy(saved):createHistory(project.room);
    },
    clear() {rooms.clear();}
  };
}

// Validate before committing either the project or its undo cursor.
export function travelRoomHistory(project,history,direction) {
  if(!['undo','redo'].includes(direction)) throw Error('Unknown history direction');
  const next=direction==='undo'?undoHistory(history):redoHistory(history);
  const validated=validateProject(withActiveRoom(project,copy(next.present)));
  return {project:validated,history:{...next,present:copy(validated.room)}};
}
