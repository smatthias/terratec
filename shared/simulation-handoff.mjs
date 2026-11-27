import {receiveTerraFluxModel} from './terraflux-receiver.mjs';
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);
const object=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unsupported handoff configuration fields');};
export function validateHandoffMapping(input) {
 object(input,['version','materials','sourceMaterials','bodyOverrides','surfaceMaterialId','acceptBoundingBoxes','acceptZeroThickness']);if(input.version!==1)throw Error('Use material mapping version 1');
 if(!Array.isArray(input.materials)||input.materials.length>64)throw Error('Provide at most 64 target materials');
 const ids=new Set(),materials=input.materials.map(m=>{object(m,['id','name','densityKgM3','friction','restitution','sourceNote']);if(!id(m.id)||ids.has(m.id))throw Error('Target material IDs must be unique');ids.add(m.id);if(typeof m.name!=='string'||!m.name.trim()||m.name.length>80||typeof m.sourceNote!=='string'||!m.sourceNote.trim()||m.sourceNote.length>500)throw Error('Each target material needs a name and source note');for(const [key,min,max] of [['densityKgM3',0,1000000],['friction',0,10],['restitution',0,1]])if(typeof m[key]!=='number'||!Number.isFinite(m[key])||m[key]<min||m[key]>max||(key==='densityKgM3'&&m[key]===0))throw Error('Invalid user-supplied '+key);return {...m,name:m.name.trim(),sourceNote:m.sourceNote.trim()};});
 if(!input.sourceMaterials||typeof input.sourceMaterials!=='object'||Array.isArray(input.sourceMaterials)||Object.keys(input.sourceMaterials).length>64||!Object.entries(input.sourceMaterials).every(([k,v])=>id(k)&&id(v)))throw Error('Source material mappings need source and target IDs');
 if(!Array.isArray(input.bodyOverrides)||input.bodyOverrides.length>1024)throw Error('Provide at most 1024 scoped body overrides');
 const used=new Set(),bodyOverrides=input.bodyOverrides.map(b=>{object(b,['roomId','furnitureId','materialId']);if(![b.roomId,b.furnitureId,b.materialId].every(id))throw Error('Invalid scoped body override');const key=JSON.stringify([b.roomId,b.furnitureId]);if(used.has(key))throw Error('Duplicate body override');used.add(key);return {...b};});
 if(input.surfaceMaterialId!==null&&!id(input.surfaceMaterialId))throw Error('Choose a surface material ID or null');
 for(const key of ['acceptBoundingBoxes','acceptZeroThickness'])if(typeof input[key]!=='boolean')throw Error(key+' must be an explicit boolean');
 return {version:1,materials,sourceMaterials:{...input.sourceMaterials},bodyOverrides,surfaceMaterialId:input.surfaceMaterialId,acceptBoundingBoxes:input.acceptBoundingBoxes,acceptZeroThickness:input.acceptZeroThickness};
}
export async function prepareSimulationHandoff(text,input,options={}) {
 const mapping=validateHandoffMapping(input),scene=await receiveTerraFluxModel(text,options),targets=new Set(mapping.materials.map(m=>m.id)),issues=[],bindings=[];
 const issue=(code,message,elementId=null,severity='blocking')=>issues.push({code,message,elementId,severity});
 if(scene.surfaces.length&&!mapping.acceptZeroThickness)issue('SURFACE_ASSUMPTION','Acknowledge the zero-thickness static surface approximation');
 if(scene.bodies.length&&!mapping.acceptBoundingBoxes)issue('BODY_ASSUMPTION','Acknowledge that furniture uses bounding boxes; no mass is derived');
 const bind=(element,materialRef)=>{if(!materialRef)issue('UNMAPPED','No material mapping for '+element.id,element.id);else if(!targets.has(materialRef))issue('UNKNOWN_TARGET','Unknown target material '+materialRef,element.id);bindings.push({elementId:element.id,materialRef:materialRef??null});};
 for(const s of scene.surfaces)bind(s,mapping.surfaceMaterialId);
 for(const b of scene.bodies){const override=mapping.bodyOverrides.find(o=>o.roomId===b.roomId&&o.furnitureId===b.furnitureId);bind(b,override?.materialId??(b.materialId?mapping.sourceMaterials[b.materialId]:null));}
 for(const o of mapping.bodyOverrides)if(!scene.bodies.some(b=>b.roomId===o.roomId&&b.furnitureId===o.furnitureId))issue('UNKNOWN_BODY','Body override does not match this model: '+o.roomId+'/'+o.furnitureId);
 for(const [source,target] of Object.entries(mapping.sourceMaterials)){if(!targets.has(target))issue('UNKNOWN_TARGET','Unknown target material '+target);if(!scene.bodies.some(b=>b.materialId===source))issue('UNUSED_SOURCE','Source material '+source+' is not used by this model',null,'warning');}
 return {format:'terratec-simulation-handoff',version:1,source:scene.source,model:JSON.parse(text),scene,mapping,bindings,validation:{status:issues.some(i=>i.severity==='blocking')?'blocked':'validated-reference',issues},simulationConnected:false,note:'User-supplied reference material mapping. No solver-specific material validation, inferred mass, live simulation or engine acceptance is implied.'};
}
export async function exportSimulationHandoff(text,input,options){const handoff=await prepareSimulationHandoff(text,input,options);if(handoff.validation.status==='blocked')throw Error('Resolve blocking handoff issues before export');const output=JSON.stringify(handoff,null,2)+'\n';if(new TextEncoder().encode(output).length>8388608)throw Error('Simulation handoff exceeds 8 MiB');return output;}
