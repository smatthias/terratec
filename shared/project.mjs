import { rectangle, bounds, validateOutline } from './geometry.mjs';
export function validateProject(value) {
  if (!value || ![1,2].includes(value.schemaVersion) || value.units !== 'm')
    throw new Error('Expected schemaVersion 1 or 2 and units m');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Project name must contain 1–120 characters');
  const dimension=v=>typeof v==='number' && Number.isFinite(v) && v>=.1 && v<=1000;
  if (!value.room || !dimension(value.room.height)) throw Error('Height must be between 0.1 and 1000 metres');
  if(value.schemaVersion===1 && ![value.room.width,value.room.depth].every(dimension))
    throw Error('Room dimensions must be numbers between 0.1 and 1000 metres');
  const outline=validateOutline(value.schemaVersion===1 ? rectangle(value.room.width,value.room.depth) : value.room.outline);
  const {width,depth}=bounds(outline);
  return {schemaVersion:2,units:'m',name:value.name.trim(),room:{width,depth,height:value.room.height,outline}};
}
