import * as THREE from 'three';
import {cabinetFootprint} from '../shared/furniture.mjs';
export function addFurnitureVisuals(group,room) {
  for(const item of room.furniture||[]) {
    const angle=item.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),t=item.thickness;
    const add=(geometry,position,color,role='detail')=>{
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide}));
      mesh.position.set(...position);mesh.userData={id:'furniture:'+item.id,baseColor:color,role,furnitureId:item.id};group.add(mesh);return mesh;
    };
    const panel=(w,h,d,x,y,z,color=0xb88c59)=>{
      const mesh=add(new THREE.BoxGeometry(w,h,d),[item.x+c*x+s*z,y,item.z-s*x+c*z],color);mesh.rotation.y=angle;
    };
    panel(t,item.height,item.depth,-item.width/2+t/2,item.height/2,0);
    panel(t,item.height,item.depth,item.width/2-t/2,item.height/2,0);
    panel(item.width-2*t,t,item.depth,0,t/2,0);panel(item.width-2*t,t,item.depth,0,item.height-t/2,0);
    panel(item.width-2*t,item.height-2*t,t,0,item.height/2,-item.depth/2+t/2);
    for(let n=1;n<=item.shelves;n++)panel(item.width-2*t,t,item.depth-2*t,0,t+(item.height-2*t)*n/(item.shelves+1),0);
    for(const sign of [-1,1]) {
      panel((item.width-2*t)/2-.003,item.height-2*t,t,sign*(item.width-2*t)/4,item.height/2,item.depth/2-t/2,0xd8b788);
      panel(.015,.12,.025,sign*.04,item.height*.55,item.depth/2+.012,0x3e463d);
    }
    const footprint=cabinetFootprint(item),shape=new THREE.Shape(footprint.map(p=>new THREE.Vector2(p.x,-p.z)));
    const plan=add(new THREE.ShapeGeometry(shape),[0,.035,0],0xc49c66,'symbol');plan.rotation.x=-Math.PI/2;
  }
}
