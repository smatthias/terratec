import {traceNativeTriangle} from '../shared/native-resource-budget.mjs';
export function nativeTriangleForHit(manifest,elementId,localTriangle){
 traceNativeTriangle(manifest,0);const element=manifest.elements.find(e=>e.elementId===elementId);
 if(!element||!Number.isSafeInteger(localTriangle)||localTriangle<0||localTriangle>=element.triangleCount)throw Error('Invalid native preview source hit');
 return element.firstTriangle+localTriangle;
}
export function validateNativePreviewScene(scene,manifest){
 traceNativeTriangle(manifest,0);const meshes=[...scene.surfaces,...scene.bodies];
 if(meshes.length!==manifest.elements.length||meshes.some((m,i)=>m.id!==manifest.elements[i].elementId||m.indices.length/3!==manifest.elements[i].triangleCount))throw Error('Native preview geometry disagrees with verified source ranges');
}
export function highlightNativeElement(group,elementId){
 for(const mesh of group.children){const selected=mesh.userData.id===elementId,wall=mesh.userData.kind==='wall';mesh.material.emissive.setHex(selected?0x9c5000:0);mesh.material.emissiveIntensity=selected?.8:0;mesh.material.opacity=selected?1:wall?.35:1;mesh.material.depthWrite=selected||!wall;mesh.userData.selected=selected;}
}
