import { edgeIds } from './geometry.mjs';
export function wallLength(outline,wall) {
  const i=edgeIds.indexOf(wall);
  if(i<0) throw Error('Unknown wall');
  const a=outline[i],b=outline[(i+1)%4];
  return Math.hypot(b.x-a.x,b.z-a.z);
}
export function validateOpenings(openings,outline,height) {
  if(!Array.isArray(openings) || openings.length>64) throw Error('Expected at most 64 openings');
  const ids=new Set();
  const result=openings.map(o=>{
    if(!o || typeof o.id!=='string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(o.id) || ids.has(o.id)) throw Error('Opening IDs must be unique');
    ids.add(o.id);
    if(!['door','window'].includes(o.type) || !edgeIds.includes(o.wall)) throw Error('Opening needs a door/window type and valid wall');
    if(![o.offset,o.width,o.height,o.sill].every(v=>typeof v==='number' && Number.isFinite(v))) throw Error('Opening dimensions must be finite numbers');
    const length=wallLength(outline,o.wall);
    if(o.offset<.05-1e-9 || o.width<.1 || o.height<.1 || o.sill<0 ||
      o.offset+o.width>length-.05+1e-9 || o.sill+o.height>height-.05+1e-9 ||
      (o.type==='door' && o.sill!==0) || (o.type==='window' && o.sill<.1))
      throw Error('Opening must fit its wall with 0.05 m end/header clearance; doors start at floor and windows need a sill of at least 0.1 m');
    return {id:o.id,type:o.type,wall:o.wall,offset:o.offset,width:o.width,height:o.height,sill:o.sill};
  });
  for(let i=0;i<result.length;i++) for(let j=i+1;j<result.length;j++) {
    const a=result[i],b=result[j];
    if(a.wall===b.wall && Math.max(a.offset,b.offset)<Math.min(a.offset+a.width,b.offset+b.width)+.05-1e-9)
      throw Error('Openings on the same wall need at least 0.05 m horizontal separation');
  }
  return result;
}
// Rectangular wall pieces leave actual voids for doors and windows.
export function wallPanels(length,height,openings) {
  const cuts=[-.08,...openings.flatMap(o=>[o.offset,o.offset+o.width]),length+.08].sort((a,b)=>a-b);
  const panels=[];
  for(let i=0;i<cuts.length-1;i++) {
    const left=cuts[i],right=cuts[i+1];
    if(right-left<1e-9) continue;
    const opening=openings.find(o=>(left+right)/2>o.offset && (left+right)/2<o.offset+o.width);
    const spans=opening?[[0,opening.sill],[opening.sill+opening.height,height]]:[[0,height]];
    for(const [bottom,top] of spans) if(top-bottom>1e-9) panels.push({left,right,bottom,top});
  }
  return panels;
}
export function openingPreset(room,wall,type,id,offset) {
  const length=wallLength(room.outline,wall),height=room.height;
  return {id,wall,type,offset,width:Math.min(type==='door'?.9:1.2,length-.2),
    height:type==='door'?Math.min(2.1,height-.05):Math.min(1.2,height*.4),sill:type==='door'?0:Math.max(.1,height*.3)};
}
export function openingAtPoint(room,wall,type,id,point,spacing,snap=true,tolerance=.25) {
  const i=edgeIds.indexOf(wall),length=wallLength(room.outline,wall);
  const a=room.outline[i],b=room.outline[(i+1)%4],tx=(b.x-a.x)/length,tz=(b.z-a.z)/length;
  const along=(point.x-a.x)*tx+(point.z-a.z)*tz;
  const distance=Math.abs((point.x-a.x)*(-tz)+(point.z-a.z)*tx);
  if(!Number.isFinite(along) || distance>tolerance) throw Error('Click near the selected wall to place an opening');
  const preset=openingPreset(room,wall,type,id,0);
  const offset=along-preset.width/2;
  preset.offset=snap?Number((Math.round(offset/spacing)*spacing).toFixed(8)):offset;
  validateOpenings([...room.openings,preset],room.outline,room.height);
  return preset;
}
