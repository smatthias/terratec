import {createHistory} from './history.mjs';
import {activeRoomId} from './project-rooms.mjs';
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
