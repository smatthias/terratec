import {validateStock} from './stock.mjs';
export function validateWorkshopProfiles(value) {
  if(!Array.isArray(value)||value.length>32)throw Error('Expected at most 32 workshop profiles');
  const ids=new Set(),names=new Set();
  return value.map(profile=>{
    if(!profile||typeof profile.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(profile.id)||ids.has(profile.id))throw Error('Workshop profile IDs must be unique');
    if(typeof profile.name!=='string'||!profile.name.trim()||profile.name.trim().length>60||names.has(profile.name.trim().toLowerCase()))throw Error('Workshop profile names must be unique and contain 1–60 characters');
    const name=profile.name.trim();ids.add(profile.id);names.add(name.toLowerCase());
    return {id:profile.id,name,...validateStock(profile)};
  });
}
export function saveWorkshopProfile(profiles,profile) {
  const same=profiles.find(p=>p.name.toLowerCase()===profile.name.trim().toLowerCase());
  const next={...profile,id:same?.id??profile.id};
  return validateWorkshopProfiles(same?profiles.map(p=>p.id===same.id?next:p):[...profiles,next]);
}
export function applyWorkshopProfile(room,cabinetId,profile) {
  const settings=validateStock(profile);
  if(!room.furniture.some(c=>c.id===cabinetId))throw Error('Select a cabinet to apply a workshop profile');
  return {...room,furniture:room.furniture.map(c=>c.id===cabinetId?{...c,...settings}:c)};
}
