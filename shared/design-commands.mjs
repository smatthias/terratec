import {validateProject} from './project.mjs';
import {activeRoomId,withActiveRoom} from './project-rooms.mjs';
import {validateFurniture} from './furniture.mjs';
import {checkRoomEdit} from './room-lock.mjs';
export const MAX_COMMAND_BYTES=32768,MAX_DESIGN_COMMANDS=20;
const copy=value=>JSON.parse(JSON.stringify(value));
const keys=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('Unexpected command fields');};
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))throw Error('Choose a valid furniture ID');};
const number=value=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error('Command coordinates and dimensions must be finite numbers');};
export function prepareDesignCommands(input,text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_COMMAND_BYTES)throw Error('Design command input exceeds 32 KiB');
  let request;try{request=JSON.parse(text);}catch{throw Error('Enter valid command JSON');}
  keys(request,['version','units','roomId','commands']);
  if(request.version!==1||request.units!=='m')throw Error('Use command version 1 and units m');
  const before=validateProject(input);
  if(request.roomId!==activeRoomId(before))throw Error('Commands must target the current active room');
  if(!Array.isArray(request.commands)||!request.commands.length||request.commands.length>MAX_DESIGN_COMMANDS)throw Error('Provide 1–20 design commands');
  const room=copy(before.room);
  for(const [index,command] of request.commands.entries())try {
    const op=command?.op;
    if(op==='add-cabinet') {
      keys(command,['op','item']);keys(command.item,['id','name','width','depth','height','x','z','rotation','thickness','shelves','material']);
      id(command.item.id);if(room.furniture.some(item=>item.id===command.item.id))throw Error('Furniture ID already exists');
      const item={type:'cabinet',rotation:0,thickness:.018,shelves:1,material:'oak',...command.item};
      room.furniture.push(validateFurniture([item],room.outline,room.height)[0]);
    }else {
      const operations={move:['op','id','x','z'],rotate:['op','id','rotation'],rename:['op','id','name'],remove:['op','id']},fields=Object.hasOwn(operations,op)?operations[op]:null;
      if(!fields)throw Error('Supported operations: add-cabinet, move, rotate, rename, remove');
      keys(command,fields);id(command.id);const i=room.furniture.findIndex(item=>item.id===command.id);if(i<0)throw Error('Furniture ID not found');
      if(op==='remove')room.furniture.splice(i,1);
      if(op==='move'){number(command.x);number(command.z);room.furniture[i]={...room.furniture[i],x:command.x,z:command.z};}
      if(op==='rotate'){number(command.rotation);if(command.rotation<0||command.rotation>=360)throw Error('Rotation must be from 0 up to 360 degrees');room.furniture[i]={...room.furniture[i],rotation:command.rotation};}
      if(op==='rename'){if(typeof command.name!=='string'||!command.name.trim()||command.name.trim().length>60)throw Error('Furniture names need 1–60 characters');room.furniture[i]={...room.furniture[i],name:command.name.trim()};}
    }
  }catch(error){throw Error('Command '+(index+1)+': '+error.message);}
  const next=validateProject(withActiveRoom(before,room));checkRoomEdit(before.room,next.room);
  if(JSON.stringify(before.room)===JSON.stringify(next.room))throw Error('The batch makes no change');
  const ids=new Set([...before.room.furniture.map(i=>i.id),...next.room.furniture.map(i=>i.id)]),changes=[];
  for(const id of ids){const a=before.room.furniture.find(i=>i.id===id),b=next.room.furniture.find(i=>i.id===id);if(JSON.stringify(a)!==JSON.stringify(b))changes.push({id,action:!a?'add':!b?'remove':'update',before:a??null,after:b??null});}
  return {sourceKey:JSON.stringify(input),resultKey:JSON.stringify(next),request,count:request.commands.length,changes,room:next.room};
}
export function applyPreparedDesignCommands(project,prepared) {
  if(JSON.stringify(project)!==prepared?.sourceKey)throw Error('Project changed after preview; preview the commands again');
  const checked=prepareDesignCommands(project,JSON.stringify(prepared.request));
  if(checked.resultKey!==prepared.resultKey)throw Error('Commands changed after preview; preview again');
  return validateProject(withActiveRoom(project,checked.room));
}
