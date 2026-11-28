import {nativeResourceCheck} from './native-resource-budget.mjs';
import {verifySimulationHandoff} from './simulation-handoff.mjs';
import {storedZip} from './stored-zip.mjs';
export const NATIVE_VIEWER_PROFILE=Object.freeze({id:'terraflux-native-scene-v2',repository:'smatthias/terraflux-engine',commit:'1ce82c3c0dfd5f8f12a149a4b47d25c2c584aebc',sceneFormat:'terraflux.scene',sceneVersion:2,geometryAsset:'obj',coordinates:'right-handed Y-up metres',physicalMaterialExecution:false,simulationConnected:false,maxPositions:2000000,maxTriangleIndices:6000000,maxObjBytes:16777216});
export const NATIVE_VIEWER_CAPABILITIES=Object.freeze({sceneGeometry:true,normals:true,relativeObjAssets:true,nativeRendering:null,physicalMaterialExecution:false,rigidBodySimulation:false,fluidSimulation:false,structuralSimulation:false});
export function nativeViewerCapabilities(requiredFeatures=['sceneGeometry']) {
 if(!Array.isArray(requiredFeatures)||!requiredFeatures.length||requiredFeatures.length>16||new Set(requiredFeatures).size!==requiredFeatures.length||!requiredFeatures.every(f=>typeof f==='string'&&/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(f)))throw Error('Choose 1–16 unique capability names');
 const unsupported=requiredFeatures.filter(f=>!Object.hasOwn(NATIVE_VIEWER_CAPABILITIES,f)||NATIVE_VIEWER_CAPABILITIES[f]===false),unverified=requiredFeatures.filter(f=>NATIVE_VIEWER_CAPABILITIES[f]===null);
 return {profileId:NATIVE_VIEWER_PROFILE.id,engineCommit:NATIVE_VIEWER_PROFILE.commit,requiredFeatures:[...requiredFeatures],unsupported,unverified,status:unsupported.length?'blocked':unverified.length?'requires-runtime-check':'supported-by-profile'};
}
export async function nativeViewerBundle(text,options={}) {
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['requiredFeatures','resourceBudget'].includes(k)))throw Error('Unsupported native adapter options');
 const capabilityCheck=nativeViewerCapabilities(options.requiredFeatures);
 if(capabilityCheck.status==='blocked')throw Error('Native viewer lacks required capabilities: '+capabilityCheck.unsupported.join(', '));
 if(capabilityCheck.status==='requires-runtime-check')throw Error('Native rendering requires a runtime smoke check on this graphics setup');
 const {handoff}=await verifySimulationHandoff(text,{requireChecksum:true}),meshes=[...handoff.scene.surfaces,...handoff.scene.bodies];
 const resources=nativeResourceCheck(meshes.reduce((sum,m)=>sum+m.indices.length/3,0),options.resourceBudget);if(resources.status==='blocked')throw Error('Native resource budget exceeded: '+resources.exceeded.join(', '));
 const lines=['# TerraTec native viewer geometry; metres, Y up; no physical material execution'],elements=[];let offset=0,triangle=0;
 for(const mesh of meshes){
  const count=mesh.positions.length/3;if(offset+count>NATIVE_VIEWER_PROFILE.maxPositions||triangle*3+mesh.indices.length>NATIVE_VIEWER_PROFILE.maxTriangleIndices)throw Error('Native viewer geometry limits exceeded');
  lines.push('# element '+elements.length);for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+mesh.positions.slice(i,i+3).join(' '));for(let i=0;i<mesh.normals.length;i+=3)lines.push('vn '+mesh.normals.slice(i,i+3).join(' '));
  for(let i=0;i<mesh.indices.length;i+=3)lines.push('f '+mesh.indices.slice(i,i+3).map(index=>{const n=offset+index+1;return n+'//'+n;}).join(' '));
  elements.push({elementId:mesh.id,kind:mesh.kind,roomId:mesh.roomId,...(mesh.wallId?{wallId:mesh.wallId}:{}),...(mesh.furnitureId?{furnitureId:mesh.furnitureId}:{}),materialRef:handoff.bindings.find(b=>b.elementId===mesh.id)?.materialRef??null,firstTriangle:triangle,triangleCount:mesh.indices.length/3});offset+=count;triangle+=mesh.indices.length/3;
 }
 const obj=lines.join('\n')+'\n';if(new TextEncoder().encode(obj).length>NATIVE_VIEWER_PROFILE.maxObjBytes)throw Error('Native viewer OBJ exceeds 16 MiB');
 const node=(name,mesh=false)=>({name,parent:0,mesh_instance:mesh,translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...(mesh?{mesh_asset:'terratec-model'}:{})});
 const scene={format:'terraflux.scene',version:2,nodes:[node('Root'),node('TerraTecModel',true)],assets:{'terratec-model':'assets/model.obj'}};
 const manifest={format:'terratec-native-viewer-adapter',version:1,profile:NATIVE_VIEWER_PROFILE,capabilityCheck,resources,source:handoff.source,handoffSha256:handoff.handoffSha256,summary:{positions:offset,triangles:triangle,elements:elements.length,bounds:handoff.scene.summary.bounds},elements,materialBindingsFile:'handoff.json',warnings:['Geometry and normals are supported by the pinned native viewer.','Physical materials, density, friction, restitution, body mass and solver execution are not consumed by this scene loader.','All geometry is in one mesh asset; scoped element ranges are preserved in this sidecar, not native selectable nodes.','Receiver placement is baked into OBJ vertices; scene transforms are identity.'],simulationConnected:false};
 const files=[{name:'scene.json',content:JSON.stringify(scene,null,2)+'\n'},{name:'assets/model.obj',content:obj},{name:'handoff.json',content:JSON.stringify(handoff,null,2)+'\n'},{name:'adapter.json',content:JSON.stringify(manifest,null,2)+'\n'}];
 return {files,manifest};
}
export async function nativeViewerZip(text,options){const bundle=await nativeViewerBundle(text,options);return {bytes:storedZip(bundle.files),manifest:bundle.manifest};}
