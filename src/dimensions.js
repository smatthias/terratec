import * as THREE from 'three';
import {edgeIds} from '../shared/geometry.mjs';
export function dimensionLayout(outline,camera,width,height) {
  const screen=p=>{const v=new THREE.Vector3(p.x,0,p.z).project(camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2};};
  return outline.map((a,i)=>{
    const b=outline[(i+1)%outline.length],length=Math.hypot(b.x-a.x,b.z-a.z),p=screen(a),q=screen(b);
    const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
    const inner=screen({x:middle.x-(b.z-a.z)/length,z:middle.z+(b.x-a.x)/length});
    const centre=screen(middle),nx=centre.x-inner.x,ny=centre.y-inner.y,n=Math.hypot(nx,ny);
    const ux=nx/n,uy=ny/n,dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy),tx=dx/d,ty=dy/d;
    const start={x:p.x+ux*28,y:p.y+uy*28},end={x:q.x+ux*28,y:q.y+uy*28};
    const tick=point=>({x1:point.x-(tx+ux)*4,y1:point.y-(ty+uy)*4,x2:point.x+(tx+ux)*4,y2:point.y+(ty+uy)*4});
    const extension=point=>({x1:point.x+ux*4,y1:point.y+uy*4,x2:point.x+ux*36,y2:point.y+uy*36});
    return {id:edgeIds[i],length:length.toFixed(2),x:(start.x+end.x)/2,y:(start.y+end.y)/2,
      visible:Number.isFinite(n+d) && n>0 && d>0 && centre.x>=0 && centre.x<=width && centre.y>=0 && centre.y<=height,
      segments:[{x1:start.x,y1:start.y,x2:end.x,y2:end.y},extension(p),extension(q),tick(start),tick(end)]};
  });
}
