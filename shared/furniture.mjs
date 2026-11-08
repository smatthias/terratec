import {cabinetCompartments} from './cabinet-compartments.mjs';
import {validateStock} from './stock.mjs';
import {snapPoint} from './geometry.mjs';
export function cabinetFootprint(item) {
  const angle=item.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>({x:item.x+c*x*item.width/2+s*z*item.depth/2,z:item.z-s*x*item.width/2+c*z*item.depth/2}));
}
function overlaps(a,b) {
  for(const polygon of [a,b])for(let i=0;i<4;i++) {
    const p=polygon[i],q=polygon[(i+1)%4],axis={x:-(q.z-p.z),z:q.x-p.x};
    const project=points=>points.map(v=>v.x*axis.x+v.z*axis.z),pa=project(a),pb=project(b);
    if(Math.max(...pa)<=Math.min(...pb)+1e-9 || Math.max(...pb)<=Math.min(...pa)+1e-9) return false;
  }
  return true;
}
export function validateFurniture(value,outline,roomHeight) {
  if(!Array.isArray(value)||value.length>64) throw Error('Expected at most 64 furniture items');
  const ids=new Set(),footprints=[];
  return value.map(item=>{
    if(!item || typeof item.id!=='string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) throw Error('Furniture IDs must be unique');
    if(item.type!=='cabinet' || typeof item.name!=='string' || !item.name.trim() || item.name.trim().length>60) throw Error('Cabinet needs a name of 1–60 characters');
    if(!['width','depth','height','x','z','rotation','thickness'].every(k=>typeof item[k]==='number'&&Number.isFinite(item[k])) ||
      !['width','depth','height'].every(k=>item[k]>=.2&&item[k]<=10) || item.height>roomHeight || Math.abs(item.x)>1000 || Math.abs(item.z)>1000 || item.rotation<0 || item.rotation>=360 ||
      item.thickness<.012 || item.thickness>.05 || item.thickness>=Math.min(item.width,item.depth,item.height)/4 || !Number.isInteger(item.shelves) || item.shelves<0 || item.shelves>10)
      throw Error('Invalid cabinet dimensions, panel thickness, shelves or rotation');
    const material=item.material??'oak',lengthAllowanceMm=item.lengthAllowanceMm??0,widthAllowanceMm=item.widthAllowanceMm??0;
    if(!['oak','birch','white'].includes(material) || ![lengthAllowanceMm,widthAllowanceMm].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=50)) throw Error('Choose a supported material and allowances from 0 to 50 mm');
    cabinetCompartments(item);
    const stock=validateStock(item);
    const footprint=cabinetFootprint(item);
    for(const p of footprint)for(let i=0;i<outline.length;i++) {
      const a=outline[i],b=outline[(i+1)%outline.length];
      if((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)<-1e-8) throw Error('Cabinet must fit inside the room');
    }
    if(footprints.some(other=>overlaps(footprint,other))) throw Error('Cabinets cannot overlap');
    ids.add(item.id);footprints.push(footprint);
    return {...(item.columnWeights!==undefined?{columnWeights:[...item.columnWeights]}:{}),...(item.columnShelves!==undefined?{columnShelves:[...item.columnShelves]}:{}),...(item.columns!==undefined?{columns:item.columns}:{}),id:item.id,type:'cabinet',name:item.name.trim(),width:item.width,depth:item.depth,height:item.height,x:item.x,z:item.z,rotation:item.rotation,thickness:item.thickness,shelves:item.shelves,material,lengthAllowanceMm,widthAllowanceMm,...stock};
  });
}

export function moveFurniture(room,id,point,spacing,snap=true) {
  if(!room.furniture.some(item=>item.id===id)) throw Error('Cabinet not found');
  const position=snapPoint(point,spacing,snap);
  const furniture=validateFurniture(room.furniture.map(item=>item.id===id?{...item,...position}:item),room.outline,room.height);
  return {...room,furniture};
}
