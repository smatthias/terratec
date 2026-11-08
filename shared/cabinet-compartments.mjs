export function cabinetCompartments(item){
 const columns=item.columns===undefined?1:item.columns,t=item.thickness,innerWidth=item.width-2*t,innerHeight=item.height-2*t;
 if(!Number.isInteger(columns)||columns<1||columns>8)throw Error('Cabinet columns must be an integer from 1 to 8');
 const counts=item.columnShelves===undefined?Array(columns).fill(item.shelves):item.columnShelves;
 if(!Array.isArray(counts)||counts.length!==columns||!Array.from(counts).every(count=>Number.isInteger(count)&&count>=0&&count<=10))throw Error('Column shelf counts must match columns and contain integers from 0 to 10');
 if(counts.some(count=>count>0&&innerHeight/(count+1)<=t))throw Error('Column shelves do not fit the cabinet height');
 const bayWidth=(innerWidth-(columns-1)*t)/columns;
 if(!Number.isFinite(bayWidth)||bayWidth<.05)throw Error('Cabinet compartments need at least 0.05 m clear width');
 return {columns,bayWidth,innerHeight,bays:Array.from({length:columns},(_,n)=>({x:-innerWidth/2+bayWidth/2+n*(bayWidth+t),width:bayWidth,shelves:counts[n]})),dividers:Array.from({length:columns-1},(_,n)=>-innerWidth/2+(n+1)*bayWidth+(n+.5)*t)};
}
