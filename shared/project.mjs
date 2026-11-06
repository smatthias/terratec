import { rectangle, bounds, validateOutline } from './geometry.mjs';
import { validateOpenings } from './openings.mjs';
export function validateProject(value) {
  if (!value || ![1,2,3,4].includes(value.schemaVersion) || value.units !== 'm')
    throw new Error('Expected schemaVersion 1, 2, 3 or 4 and units m');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Project name must contain 1–120 characters');
  const dimension=v=>typeof v==='number' && Number.isFinite(v) && v>=.1 && v<=1000;
  if (!value.room || !dimension(value.room.height)) throw Error('Height must be between 0.1 and 1000 metres');
  if(value.schemaVersion===1 && ![value.room.width,value.room.depth].every(dimension))
    throw Error('Room dimensions must be numbers between 0.1 and 1000 metres');
  const outline=validateOutline(value.schemaVersion===1 ? rectangle(value.room.width,value.room.depth) : value.room.outline);
  const {width,depth}=bounds(outline);
  const openings=validateOpenings(value.schemaVersion>=3?value.room.openings:[],outline,value.room.height);
  return {schemaVersion:4,units:'m',name:value.name.trim(),room:{width,depth,height:value.room.height,outline,openings}};
}
