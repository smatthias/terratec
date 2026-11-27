import {verifyTerraFluxModel} from './terraflux-model.mjs';
const n=v=>{const out=Number(v.toFixed(9));return Object.is(out,-0)?0:out;};
function pose(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['x','y','z','yaw'].includes(k)))throw Error('Receiver placement must contain only x, y, z and yaw');
  const p={x:0,y:0,z:0,yaw:0,...input};if(!Object.values(p).every(v=>typeof v==='number'&&Number.isFinite(v))||['x','y','z'].some(k=>Math.abs(p[k])>1e6)||Math.abs(p.yaw)>3600)throw Error('Receiver placement needs finite metres within ±1000000 and yaw within ±3600 degrees');return p;
}
const rotate=(p,angle)=>{const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:c*p.x+s*p.z,y:p.y,z:-s*p.x+c*p.z};};
const bounds=positions=>{const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};for(let i=0;i<positions.length;i+=3)for(const [j,k] of ['x','y','z'].entries()){min[k]=Math.min(min[k],positions[i+j]);max[k]=Math.max(max[k],positions[i+j]);}return {min,max};};
function mesh(polygons,transform,metadata) {
  const positions=[],normals=[],indices=[];
  for(const polygon of polygons){
    const points=polygon.map(transform),offset=positions.length/3,a=points[0],b=points[1],c=points[2],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},normal={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(normal.x,normal.y,normal.z);
    if(!(length>0))throw Error('Degenerate receiver surface; geometry cannot be triangulated');
    for(const p of points){positions.push(p.x,p.y,p.z);normals.push(n(normal.x/length),n(normal.y/length),n(normal.z/length));}
    for(let i=1;i<points.length-1;i++)indices.push(offset,offset+i,offset+i+1);
  }
  return {...metadata,positions,normals,indices,bounds:bounds(positions)};
}
function boxPolygons(body) {
  const {x,y,z}=body.size,points=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([a,b,c])=>{const p=rotate({x:a*x/2,y:b*y/2,z:c*z/2},body.rotationY);return {x:p.x+body.centre.x,y:p.y+body.centre.y,z:p.z+body.centre.z};});
  return [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]].map(face=>face.map(i=>points[i]));
}
// Reference receiver only: no engine, mass, physical properties or solver state.
export async function receiveTerraFluxModel(text,options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['placement','allowOverlaps'].includes(k))||options.allowOverlaps!==undefined&&typeof options.allowOverlaps!=='boolean')throw Error('Unsupported receiver options');
  const placement=pose(options.placement),model=await verifyTerraFluxModel(text);
  if(model.overlaps.length&&!options.allowOverlaps)throw Error('Overlapping rooms require an explicit allowOverlaps receiver option');
  const transform=p=>{const v=rotate(p,placement.yaw);return {x:n(v.x+placement.x),y:n(v.y+placement.y),z:n(v.z+placement.z)};};
  const surfaces=[],bodies=[],openings=[];
  for(const room of model.rooms){
    for(const kind of ['floor','ceiling'])surfaces.push(mesh([room[kind]],transform,{id:JSON.stringify([room.id,kind]),roomId:room.id,kind}));
    for(const wall of room.walls)for(const opening of wall.openings)openings.push({...opening,roomId:room.id,wallId:wall.id,start:transform(opening.start),end:transform(opening.end)});
    for(const wall of room.walls)if(wall.surfaces.length)surfaces.push(mesh(wall.surfaces,transform,{id:JSON.stringify([room.id,'wall',wall.id]),roomId:room.id,kind:'wall',wallId:wall.id}));
    for(const body of room.furniture)bodies.push(mesh(boxPolygons(body),transform,{id:JSON.stringify([room.id,'furniture',body.id]),roomId:room.id,furnitureId:body.id,kind:'furniture-bounds',approximation:true,materialId:body.materialId}));
  }
  const meshes=[...surfaces,...bodies],allBounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
  for(const m of meshes)for(const k of ['x','y','z']){allBounds.min[k]=Math.min(allBounds.min[k],m.bounds.min[k]);allBounds.max[k]=Math.max(allBounds.max[k],m.bounds.max[k]);}
  return {format:'terratec-terraflux-receiver-scene',version:1,units:'m',frame:{handedness:'right',up:'y',georeference:null},placement,source:{modelSha256:model.modelSha256,projectSha256:model.source.sha256},surfaces,bodies,openings,openingLinks:model.openingLinks,
    summary:{rooms:model.rooms.length,surfaces:surfaces.length,furnitureBounds:bodies.length,triangles:meshes.reduce((sum,m)=>sum+m.indices.length/3,0),bounds:allBounds},warnings:[...model.limitations,...(model.overlaps.length?['Overlapping rooms explicitly allowed; surfaces remain separate.']:[])],simulationConnected:false};
}
