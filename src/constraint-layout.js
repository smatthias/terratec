import {Vector3} from 'three';
import {wallIds,wallSegment,wallLabel} from '../shared/room-topology.mjs';
import {constraintRows} from '../shared/constraint-display.mjs';
export function constraintLayout(room,camera,width,height) {
  if(!camera||!(width>0&&height>0)) return [];
  const slots=new Map();
  return constraintRows(room).flatMap(row=>row.anchors.flatMap(anchor=>{
    const p=new Vector3(anchor.x,0,anchor.z).project(camera);
    if(![p.x,p.y,p.z].every(Number.isFinite)||p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1) return [];
    const slot=slots.get(anchor.key)??0;slots.set(anchor.key,slot+1);
    const x=(p.x+1)*width/2+(anchor.point?12:0),y=(1-p.y)*height/2+18+slot*18;
    if(x<0||x>width||y<0||y>height) return [];
    return [{key:row.key+':'+anchor.key,text:row.id+' '+row.symbol,label:row.label,x,y}];
  }));
}

export function constraintFailureLayout(room,failure,camera,width,height){
 if(!failure||!camera||!(width>0&&height>0))return [];
 const existing=new Set(wallIds(room));return [...new Set(failure.affectedWalls)].filter(id=>existing.has(id)).flatMap(wall=>{
  const {a,b}=wallSegment(room,wall),points=[a,b].map(p=>new Vector3(p.x,0,p.z).project(camera));if(points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||p.z< -1||p.z>1))return [];
  return [{wall,label:'Constraint conflict: '+wallLabel(wall),x1:(points[0].x+1)*width/2,y1:(1-points[0].y)*height/2,x2:(points[1].x+1)*width/2,y2:(1-points[1].y)*height/2}];
 });
}
