import {verifySimulationHandoff} from './simulation-handoff.mjs';
import {storedZip} from './stored-zip.mjs';
export const NATIVE_VIEWER_PROFILE=Object.freeze({id:'terraflux-native-scene-v2',repository:'smatthias/terraflux-engine',commit:'1ce82c3c0dfd5f8f12a149a4b47d25c2c584aebc',sceneFormat:'terraflux.scene',sceneVersion:2,geometryAsset:'obj',coordinates:'right-handed Y-up metres',physicalMaterialExecution:false,simulationConnected:false,maxPositions:2000000,maxTriangleIndices:6000000,maxObjBytes:16777216});
export async function nativeViewerBundle(text) {
 const {handoff}=await verifySimulationHandoff(text,{requireChecksum:true}),meshes=[...handoff.scene.surfaces,...handoff.scene.bodies],lines=['# TerraTec native viewer geometry; metres, Y up; no physical material execution'],elements=[];let offset=0,triangle=0;
 for(const mesh of meshes){
  const count=mesh.positions.length/3;if(offset+count>NATIVE_VIEWER_PROFILE.maxPositions||triangle*3+mesh.indices.length>NATIVE_VIEWER_PROFILE.maxTriangleIndices)throw Error('Native viewer geometry limits exceeded');
  lines.push('# element '+elements.length);for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+mesh.positions.slice(i,i+3).join(' '));for(let i=0;i<mesh.normals.length;i+=3)lines.push('vn '+mesh.normals.slice(i,i+3).join(' '));
  for(let i=0;i<mesh.indices.length;i+=3)lines.push('f '+mesh.indices.slice(i,i+3).map(index=>{const n=offset+index+1;return n+'//'+n;}).join(' '));
  elements.push({elementId:mesh.id,kind:mesh.kind,firstTriangle:triangle,triangleCount:mesh.indices.length/3});offset+=count;triangle+=mesh.indices.length/3;
 }
 const obj=lines.join('\n')+'\n';if(new TextEncoder().encode(obj).length>NATIVE_VIEWER_PROFILE.maxObjBytes)throw Error('Native viewer OBJ exceeds 16 MiB');
 const node=(name,mesh=false)=>({name,parent:0,mesh_instance:mesh,translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1],...(mesh?{mesh_asset:'terratec-model'}:{})});
 const scene={format:'terraflux.scene',version:2,nodes:[node('Root'),node('TerraTecModel',true)],assets:{'terratec-model':'assets/model.obj'}};
 const manifest={format:'terratec-native-viewer-adapter',version:1,profile:NATIVE_VIEWER_PROFILE,source:handoff.source,handoffSha256:handoff.handoffSha256,summary:{positions:offset,triangles:triangle,elements:elements.length,bounds:handoff.scene.summary.bounds},elements,materialBindingsFile:'handoff.json',warnings:['Geometry and normals are supported by the pinned native viewer.','Physical materials, density, friction, restitution, body mass and solver execution are not consumed by this scene loader.','All geometry is in one mesh asset; scoped element ranges are preserved in this sidecar, not native selectable nodes.','Receiver placement is baked into OBJ vertices; scene transforms are identity.'],simulationConnected:false};
 const files=[{name:'scene.json',content:JSON.stringify(scene,null,2)+'\n'},{name:'assets/model.obj',content:obj},{name:'handoff.json',content:JSON.stringify(handoff,null,2)+'\n'},{name:'adapter.json',content:JSON.stringify(manifest,null,2)+'\n'}];
 return {files,manifest};
}
export async function nativeViewerZip(text){const bundle=await nativeViewerBundle(text);return {bytes:storedZip(bundle.files),manifest:bundle.manifest};}
