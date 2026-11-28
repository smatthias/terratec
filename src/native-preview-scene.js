import * as THREE from 'three';
import {fitReceiverPreviewCamera} from './receiver-preview-scene.js';
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

export function isolateNativeElement(group,elementId,enabled){
 const found=group.children.some(mesh=>mesh.userData.id===elementId);
 for(const mesh of group.children)mesh.visible=!enabled||!found||mesh.userData.id===elementId;
 return group.children.filter(mesh=>mesh.visible).length;
}
export function nativePreviewHit(group,camera,point){
 camera.updateMatrixWorld(true);group.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(point,camera);
 return ray.intersectObjects(group.children.filter(mesh=>mesh.visible),false)[0]??null;
}
export function fitNativeSelectionCamera(camera,group,elementId,aspect){
 const mesh=group.children.find(mesh=>mesh.userData.id===elementId);if(!mesh||!Number.isFinite(aspect)||aspect<=0)throw Error('Choose a valid source element and viewport to fit');
 group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(mesh),centre=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,.1);
 fitReceiverPreviewCamera(camera,span,aspect);camera.position.add(centre);camera.lookAt(centre);camera.updateMatrixWorld(true);return {centre,span,bounds};
}
