export const IDENTITY_PLACEMENT=Object.freeze({x:0,z:0,rotation:0});
export function validateRoomPlacement(value) {
  if(value===undefined) return undefined;
  if(!value||![value.x,value.z,value.rotation].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.abs(value.x)>1000||Math.abs(value.z)>1000||Math.abs(value.rotation)>3600)
    throw Error('Room placement needs X/Z within ±1000 m and rotation within ±3600°');
  return {x:value.x,z:value.z,rotation:((value.rotation%360)+360)%360};
}
// Right-handed rotation about Y, matching furniture and the 3D workspace.
export function placedRoomPoint(point,placement=IDENTITY_PLACEMENT) {
  const angle=placement.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return {x:placement.x+point.x*c+point.z*s,z:placement.z-point.x*s+point.z*c};
}
export function roomFootprint(entry) {return entry.room.outline.map(p=>placedRoomPoint(p,entry.placement));}
// Convex SAT: edge/corner contact is allowed; wall thickness is not included.
export function footprintsOverlap(a,b) {
  for(const polygon of [a,b]) for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q.x-p.x,q.z-p.z),nx=-(q.z-p.z)/length,nz=(q.x-p.x)/length;
    const project=points=>points.map(v=>v.x*nx+v.z*nz),u=project(a),v=project(b);
    if(Math.min(Math.max(...u),Math.max(...v))-Math.max(Math.min(...u),Math.min(...v))<=1e-7) return false;
  }
  return true;
}
export function floorPlanLayout(entries) {
  const rooms=entries.map(entry=>{
    const outline=roomFootprint(entry);
    return {id:entry.id,name:entry.name,outline,points:outline.map(p=>p.x+','+p.z).join(' '),centre:{x:outline.reduce((n,p)=>n+p.x,0)/outline.length,z:outline.reduce((n,p)=>n+p.z,0)/outline.length}};
  });
  const overlaps=[];
  for(let i=0;i<rooms.length;i++) for(let j=i+1;j<rooms.length;j++) if(footprintsOverlap(rooms[i].outline,rooms[j].outline)) overlaps.push({a:rooms[i].id,b:rooms[j].id,names:[rooms[i].name,rooms[j].name]});
  const points=rooms.flatMap(room=>room.outline),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),span=Math.max(maxX-minX,maxZ-minZ),margin=Math.max(1,span*.08);
  return {rooms,overlaps,viewBox:[minX-margin,minZ-margin,maxX-minX+margin*2,maxZ-minZ+margin*2].join(' '),fontSize:Math.max(.12,span/45),strokeWidth:Math.max(.02,span/400)};
}
