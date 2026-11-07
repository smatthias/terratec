import * as THREE from 'three';
import {cabinetFootprint} from '../shared/furniture.mjs';
import {cabinetParts} from '../shared/cabinet-parts.mjs';
export function addFurnitureVisuals(group,room) {
  for(const item of room.furniture||[]) {
    const angle=item.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const add=(geometry,position,color,role='detail')=>{
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide}));
      mesh.position.set(...position);mesh.userData={id:'furniture:'+item.id,baseColor:color,role,furnitureId:item.id};group.add(mesh);return mesh;
    };
    const panel=(w,h,d,x,y,z,color=0xb88c59)=>{
      const mesh=add(new THREE.BoxGeometry(w,h,d),[item.x+c*x+s*z,y,item.z-s*x+c*z],color);mesh.rotation.y=angle;
    };
    for(const part of cabinetParts(item)) panel(...part.size,...part.position,part.color);
    const footprint=cabinetFootprint(item),shape=new THREE.Shape(footprint.map(p=>new THREE.Vector2(p.x,-p.z)));
    const plan=add(new THREE.ShapeGeometry(shape),[0,.035,0],0xc49c66,'symbol');plan.rotation.x=-Math.PI/2;
  }
}
