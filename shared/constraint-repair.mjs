import {validateProject} from './project.mjs';
import {withActiveRoom} from './project-rooms.mjs';
import {constraintKey} from './constraint-display.mjs';
import {setLengthConstraint,setAngleConstraint,constraintDiagnostics} from './room-constraints.mjs';
import {assertUnlocked} from './room-lock.mjs';
import {cornerIds} from './room-topology.mjs';
export function previewConstraintRepair(project,attempt,relaxedKeys){
 const source=validateProject(project);assertUnlocked(source.room,'repair constraints');
 if(!attempt||!['length','angle'].includes(attempt.type)||Object.keys(attempt).some(k=>!(attempt.type==='length'?['type','wall','length']:['type','wall','other','relationship']).includes(k)))throw Error('Choose a failed fixed-length or wall-relationship edit');
 if(!Array.isArray(relaxedKeys)||!relaxedKeys.length||relaxedKeys.length>64||new Set(relaxedKeys).size!==relaxedKeys.length)throw Error('Choose one or more saved rules to relax');
 const saved=new Set((source.room.constraints??[]).map(constraintKey));if(relaxedKeys.some(key=>!saved.has(key)))throw Error('A chosen rule no longer exists');
 const room={...source.room,constraints:(source.room.constraints??[]).filter(c=>!relaxedKeys.includes(constraintKey(c)))},changed=attempt.type==='length'?setLengthConstraint(room,attempt.wall,attempt.length):setAngleConstraint(room,attempt.wall,attempt.other,attempt.relationship),next=validateProject(withActiveRoom(source,changed)).room;
 const changes=cornerIds(source.room).flatMap((corner,i)=>{const before=source.room.outline[i],after=next.outline[i];return Math.hypot(before.x-after.x,before.z-after.z)>1e-9?[{corner,before:{...before},after:{...after}}]:[];});
 return {sourceKey:JSON.stringify(project),attempt:{...attempt},relaxedKeys:[...relaxedKeys],room:next,changes,residuals:constraintDiagnostics(next)};
}
export function constraintRepairRoom(project,preview){
 if(!preview||preview.sourceKey!==JSON.stringify(project))throw Error('Project changed after repair preview; preview again');
 const fresh=previewConstraintRepair(project,preview.attempt,preview.relaxedKeys);if(JSON.stringify(fresh.room)!==JSON.stringify(preview.room))throw Error('Repair preview changed; preview again');return fresh.room;
}
