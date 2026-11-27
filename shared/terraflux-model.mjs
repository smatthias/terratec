import {validateProject} from './project.mjs';
import {roomEntries} from './project-rooms.mjs';
import {placedRoomPoint,floorPlanLayout} from './room-placement.mjs';
import {roomWalls} from './room-topology.mjs';
export const MAX_TERRAFLUX_MODEL_BYTES=2097152;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const json=value=>JSON.stringify(canonical(value));
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
const n=value=>{const v=Number(value.toFixed(9));return Object.is(v,-0)?0:v;};
export async function createTerraFluxModel(input,generatedAt=new Date().toISOString()) {
  if(typeof generatedAt!=='string'||generatedAt.length>40||!Number.isFinite(Date.parse(generatedAt)))throw Error('Invalid model export date');
  const project=validateProject(input),entries=roomEntries(project),layout=floorPlanLayout(entries);
  const rooms=entries.map(entry=>{
    const world=(point,y=0)=>{const p=placedRoomPoint(point,entry.placement);return {x:n(p.x),y:n(y),z:n(p.z)};};
    const walls=roomWalls(entry.room).map(wall=>{
      const openings=entry.room.openings.filter(o=>o.wall===wall.id),at=(along,y)=>world({x:wall.a.x+wall.tx*along,z:wall.a.z+wall.tz*along},y);
      // Interior wall planes: exact endpoints, no renderer overlap extensions.
      const cuts=[...new Set([0,wall.length,...openings.flatMap(o=>[o.offset,o.offset+o.width])])].sort((a,b)=>a-b),surfaces=[];
      for(let i=0;i<cuts.length-1;i++) {
        const a=cuts[i],b=cuts[i+1];if(b-a<1e-9)continue;
        const opening=openings.find(o=>(a+b)/2>o.offset&&(a+b)/2<o.offset+o.width),spans=opening?[[0,opening.sill],[opening.sill+opening.height,entry.room.height]]:[[0,entry.room.height]];
        for(const [bottom,top] of spans)if(top-bottom>1e-9)surfaces.push([at(a,bottom),at(b,bottom),at(b,top),at(a,top)]);
      }
      return {id:wall.id,start:at(0,0),end:at(wall.length,0),surfaces,openings:openings.map(o=>({id:o.id,type:o.type,width:o.width,height:o.height,sill:o.sill,start:at(o.offset,o.sill),end:at(o.offset+o.width,o.sill)}))};
    });
    const floor=entry.room.outline.map(p=>world(p)).reverse();
    return {id:entry.id,name:entry.name,height:entry.room.height,floor,ceiling:entry.room.outline.map(p=>world(p,entry.room.height)),walls,
      furniture:entry.room.furniture.map(item=>({id:item.id,name:item.name,type:item.type,...(item.type==='design'?{designId:item.designId}:{}),geometry:'oriented-bounding-box',centre:world(item,item.height/2),size:{x:item.width,y:item.height,z:item.depth},rotationY:n(((entry.placement?.rotation??0)+item.rotation)%360),materialId:item.material??null}))};
  });
  const payload={format:'terratec-terraflux-model',version:1,generatedAt,units:'m',frame:{handedness:'right',up:'y',horizontal:['x','z'],origin:'project-local',georeference:null},
    source:{sha256:await digest(project),project},rooms,openingLinks:project.openingLinks??[],overlaps:layout.overlaps.map(pair=>({a:pair.a,b:pair.b})),
    limitations:['Interior planes have zero thickness; shared room boundaries remain separate.','Furniture is an oriented bounding box; design internals and cabinet cavities are not collision geometry.','No georeference, terrain elevation, physical material properties or simulation parameters are supplied.','This is a TerraTec exchange contract; a receiving TerraFlux adapter is required.']};
  const result={...payload,modelSha256:await digest(payload)};
  if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_TERRAFLUX_MODEL_BYTES)throw Error('TerraFlux model exceeds 2 MiB');
  return result;
}
export async function exportTerraFluxModel(project,generatedAt){const text=JSON.stringify(await createTerraFluxModel(project,generatedAt),null,2)+'\n';if(new TextEncoder().encode(text).length>MAX_TERRAFLUX_MODEL_BYTES)throw Error('TerraFlux model exceeds 2 MiB');return text;}
export async function verifyTerraFluxModel(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_TERRAFLUX_MODEL_BYTES)throw Error('TerraFlux model exceeds 2 MiB');
  let input;try{input=JSON.parse(text);}catch{throw Error('Invalid TerraFlux model JSON');}
  if(input?.format!=='terratec-terraflux-model'||input.version!==1)throw Error('Unsupported TerraFlux model format');
  const expected=await createTerraFluxModel(input.source?.project,input.generatedAt);
  if(json(input)!==json(expected))throw Error('TerraFlux model integrity or derived geometry check failed');
  return expected;
}
