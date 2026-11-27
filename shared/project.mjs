import {validateConstraints} from './room-constraints.mjs';
import {validateFurniturePresets} from './furniture-library.mjs';
import {validateWorkshopProfiles} from './workshop-profiles.mjs';
import { rectangle, bounds, validateOutline } from './geometry.mjs';
import { validateOpenings } from './openings.mjs';
import { validatePresets } from './presets.mjs';
import { validateFurniture } from './furniture.mjs';
import { validateWalls, usesDefaultWalls } from './room-topology.mjs';
import { validateDesigns } from './furniture-design.mjs';
import { syncPlacedDesign } from './design-placement.mjs';
function validateSingleProject(value) {
  if (!value || ![1,2,3,4,5,6,7,8,9].includes(value.schemaVersion) || value.units !== 'm')
    throw new Error('Expected schemaVersion 1, 2, 3, 4, 5, 6, 7, 8, 9 or 10 and units m');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Project name must contain 1–120 characters');
  const dimension=v=>typeof v==='number' && Number.isFinite(v) && v>=.1 && v<=1000;
  if (!value.room || !dimension(value.room.height)) throw Error('Height must be between 0.1 and 1000 metres');
  if(value.schemaVersion===1 && ![value.room.width,value.room.depth].every(dimension))
    throw Error('Room dimensions must be numbers between 0.1 and 1000 metres');
  const outline=validateOutline(value.schemaVersion===1 ? rectangle(value.room.width,value.room.depth) : value.room.outline);
  if(value.schemaVersion<7 && outline.length!==4) throw Error('Schema 1–6 rooms need four corners');
  // Never reinterpret stored wall IDs as the original four: that would silently rename walls.
  if(value.schemaVersion<7 && value.room.walls!==undefined && !usesDefaultWalls(value.room.walls)) throw Error('Stored wall lists require schemaVersion 7');
  if(value.schemaVersion<7 && value.room.locked===true) throw Error('Locked rooms require schemaVersion 7');
  const locked=value.schemaVersion>=7 && value.room.locked!==undefined ? value.room.locked : false;
  if(typeof locked!=='boolean') throw Error('Room lock must be true or false');
  // Furniture designs are schema 7 project data; an empty list is not stored.
  if(value.schemaVersion<7 && value.furnitureDesigns?.length) throw Error('Furniture designs require schemaVersion 7');
  const designs=value.schemaVersion>=7 && value.furnitureDesigns!==undefined ? validateDesigns(value.furnitureDesigns) : [];
  // Schema 7 stores wall IDs; rooms with the original four walls are written as schema 6.
  const walls=validateWalls(value.schemaVersion>=7?value.room.walls:undefined,outline.length);
  if(value.schemaVersion<8 && value.room.constraints!==undefined) throw Error('Room constraints require schemaVersion 8');
  if(value.schemaVersion<9 && value.room.constraints?.some?.(c=>c?.type==='parallel'||c?.type==='perpendicular')) throw Error('Wall relationships require schemaVersion 9');
  const constraints=validateConstraints(value.room.constraints,{outline,walls});
  const {width,depth}=bounds(outline);
  const openings=validateOpenings(value.schemaVersion>=3?value.room.openings:[],{outline,walls},value.room.height);
  const presets=validatePresets(value.schemaVersion>=5?value.presets:[]);
  // Placed designs take their size from the design they refer to.
  const designsById=new Map(designs.map(d=>[d.id,d])),rawFurniture=value.schemaVersion>=6?value.room.furniture:[];
  const furniture=validateFurniture(Array.isArray(rawFurniture)?rawFurniture.map(item=>item?.type==='design'?syncPlacedDesign(item,designsById):item):rawFurniture,outline,value.room.height);
  return {...(value.furniturePresets!==undefined?{furniturePresets:validateFurniturePresets(value.furniturePresets)}:{}),schemaVersion:constraints?(constraints.some(c=>c.other)?9:8):(walls||locked||designs.length?7:6),presets,...(designs.length?{furnitureDesigns:designs}:{}),workshopProfiles:validateWorkshopProfiles(value.workshopProfiles??[]),units:'m',name:value.name.trim(),room:{width,depth,height:value.room.height,outline,...(constraints?{constraints}:{}),...(walls?{walls}:{}),...(locked?{locked}:{}),openings,furniture}};
}

// Schema 10 keeps the legacy room field as a checked active-room alias. All
// collection entries are validated, including rooms that are not being edited.
export function validateProject(value) {
  if(value?.schemaVersion!==10) {
    if(value?.rooms!==undefined||value?.activeRoomId!==undefined) throw Error('Room collections require schemaVersion 10');
    return validateSingleProject(value);
  }
  if(!Array.isArray(value.rooms)||value.rooms.length<1||value.rooms.length>16) throw Error('Projects need 1–16 rooms');
  const seen=new Set();
  const rooms=value.rooms.map(entry=>{
    if(!entry||typeof entry.id!=='string'||!/^room-[a-z0-9-]{1,64}$/.test(entry.id)||seen.has(entry.id)) throw Error('Room IDs must be unique room- identifiers');
    seen.add(entry.id);
    if(typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>60) throw Error('Room name must contain 1–60 characters');
    const room=validateSingleProject({...value,schemaVersion:9,room:entry.room}).room;
    return {id:entry.id,name:entry.name.trim(),room};
  });
  const active=rooms.find(entry=>entry.id===value.activeRoomId);
  if(!active) throw Error('Active room must exist in the project');
  const single=validateSingleProject({...value,schemaVersion:9});
  if(JSON.stringify(single.room)!==JSON.stringify(active.room)) throw Error('Active room alias differs from its saved room');
  return {...single,schemaVersion:10,rooms,activeRoomId:active.id,room:active.room};
}
