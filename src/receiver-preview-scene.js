import * as THREE from 'three';
export function receiverPreviewFrame(scene) {
  const {min,max}=scene.summary.bounds,centre=new THREE.Vector3((min.x+max.x)/2,(min.y+max.y)/2,(min.z+max.z)/2),span=Math.max(max.x-min.x,max.y-min.y,max.z-min.z);
  return {centre,span:Math.max(span,.1)};
}
export function createReceiverPreviewGroup(scene,{ceilings=false,wireframe=false}={}) {
  const group=new THREE.Group(),{centre}=receiverPreviewFrame(scene);
  for(const data of [...scene.surfaces,...scene.bodies]) {
    if(data.kind==='ceiling'&&!ceilings)continue;
    const geometry=new THREE.BufferGeometry(),positions=data.positions.map((v,i)=>v-centre.getComponent(i%3));
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));geometry.setIndex(data.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const wall=data.kind==='wall',body=data.kind==='furniture-bounds';
    const material=new THREE.MeshStandardMaterial({color:body?0xc98c48:wall?0x5b8c90:0x9aae91,roughness:.85,side:THREE.DoubleSide,transparent:wall,opacity:wall?.35:1,depthWrite:!wall,wireframe});
    const mesh=new THREE.Mesh(geometry,material);mesh.userData={id:data.id,kind:data.kind};group.add(mesh);
  }
  return group;
}
export function disposeReceiverPreviewGroup(group) {group?.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});group?.clear();}
export function fitReceiverPreviewCamera(camera,span,aspect) {
  const angle=camera.fov*Math.PI/360,distance=span*1.1/Math.tan(angle)/Math.min(1,aspect);camera.aspect=aspect;camera.near=Math.max(.001,span/10000);camera.far=Math.max(100,distance*10);camera.position.set(distance*.7,distance*.6,distance);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
}
