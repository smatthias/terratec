import {receiveTerraFluxModel} from './terraflux-receiver.mjs';
export const MAX_SIMULATION_HANDOFF_BYTES=8388608;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const canonicalJson=v=>JSON.stringify(canonical(v));
async function digest(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(v)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
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
 const payload={format:'terratec-simulation-handoff',version:1,source:scene.source,model:JSON.parse(text),scene,mapping,bindings,validation:{status:issues.some(i=>i.severity==='blocking')?'blocked':'validated-reference',issues},simulationConnected:false,note:'User-supplied reference material mapping. No solver-specific material validation, inferred mass, live simulation or engine acceptance is implied.'};
 return {...payload,handoffSha256:await digest(payload)};
}
export async function exportSimulationHandoff(text,input,options){const handoff=await prepareSimulationHandoff(text,input,options);if(handoff.validation.status==='blocked')throw Error('Resolve blocking handoff issues before export');const output=JSON.stringify(handoff,null,2)+'\n';if(new TextEncoder().encode(output).length>MAX_SIMULATION_HANDOFF_BYTES)throw Error('Simulation handoff exceeds 8 MiB');return output;}

export async function verifySimulationHandoff(text,options={}) {
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='requireChecksum')||options.requireChecksum!==undefined&&typeof options.requireChecksum!=='boolean')throw Error('Unsupported handoff verification options');
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_SIMULATION_HANDOFF_BYTES)throw Error('Simulation handoff exceeds 8 MiB');
 let input;try{input=JSON.parse(text);}catch{throw Error('Invalid simulation handoff JSON');}
 if(input?.format!=='terratec-simulation-handoff'||input.version!==1)throw Error('Unsupported simulation handoff format');
 const allowed=['format','version','source','model','scene','mapping','bindings','validation','simulationConnected','note','handoffSha256'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unsupported simulation handoff fields');
 if(!input.model||!input.scene||typeof input.scene!=='object')throw Error('Simulation handoff needs an embedded model and receiver scene');
 const expected=await prepareSimulationHandoff(JSON.stringify(input.model),input.mapping,{placement:input.scene.placement,allowOverlaps:!!input.model.overlaps?.length});
 if(expected.validation.status!=='validated-reference')throw Error('Blocked simulation handoff cannot be verified as exportable');
 const hasChecksum=Object.hasOwn(input,'handoffSha256');
 if(options.requireChecksum&&!hasChecksum)throw Error('A handoff checksum is required; legacy file verification refused');
 if(hasChecksum&&(typeof input.handoffSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.handoffSha256)))throw Error('Invalid simulation handoff checksum');
 const comparison={...expected};if(!hasChecksum)delete comparison.handoffSha256;
 if(canonicalJson(input)!==canonicalJson(comparison))throw Error('Simulation handoff checksum or derived data check failed');
 return {handoff:expected,integrity:hasChecksum?'checksum-and-derived':'derived-only'};
}
