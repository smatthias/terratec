import {cabinetFootprint,validateFurniture} from './furniture.mjs';
export function cabinetInterval(item,axis){
  if(!['x','z'].includes(axis))throw Error('Choose X or Z axis');
  const values=cabinetFootprint(item).map(p=>p[axis]);
  return {min:Math.min(...values),center:item[axis],max:Math.max(...values)};
}
export function arrangeCabinet(room,id,referenceId,options){
  const item=room.furniture.find(c=>c.id===id),reference=room.furniture.find(c=>c.id===referenceId);
  if(!item||!reference||id===referenceId)throw Error('Choose two different cabinets');
  const {axis,mode}=options,a=cabinetInterval(item,axis),b=cabinetInterval(reference,axis);
  let delta;
  if(mode==='align'){
    if(!['min','center','max'].includes(options.edge))throw Error('Choose a valid alignment edge');
    delta=b[options.edge]-a[options.edge];
  }else if(mode==='gap'){
    if(!['before','after'].includes(options.side)||typeof options.gap!=='number'||!Number.isFinite(options.gap)||options.gap<0||options.gap>10)throw Error('Gap must be between 0 and 10 metres');
    delta=options.side==='after'?b.max+options.gap-a.min:b.min-options.gap-a.max;
  }else throw Error('Unknown cabinet arrangement');
  const furniture=validateFurniture(room.furniture.map(c=>c.id===id?{...c,[axis]:c[axis]+delta}:c),room.outline,room.height);
  return {...room,furniture};
}
