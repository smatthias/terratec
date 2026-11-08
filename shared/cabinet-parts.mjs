import {cabinetCompartments} from './cabinet-compartments.mjs';
import {validateStock,panelStockFit} from './stock.mjs';
export const cabinetMaterials={oak:{label:'Oak board',color:0xb88c59},birch:{label:'Birch plywood',color:0xdec49a},white:{label:'White board',color:0xe8e8e2}};
export function cabinetParts(item) {
  const {width:w,height:h,depth:d,thickness:t}=item,parts=[];
  const add=(part,label,size,position,cut,color=0xb88c59)=>parts.push({part,label,size,position,cut,color});
  for(const sign of [-1,1]) add('side','Side',[t,h,d],[sign*(w/2-t/2),h/2,0],[h,d]);
  for(const y of [t/2,h-t/2]) add('horizontal','Top/bottom',[w-2*t,t,d],[0,y,0],[w-2*t,d]);
  add('back','Back',[w-2*t,h-2*t,t],[0,h/2,-d/2+t/2],[h-2*t,w-2*t]);
  const layout=cabinetCompartments(item);
  for(const x of layout.dividers)add('divider','Divider',[t,h-2*t,d-2*t],[x,h/2,0],[h-2*t,d-2*t]);
  for(const bay of layout.bays)for(let n=1;n<=bay.shelves;n++)add('shelf','Shelf',[bay.width,t,d-2*t],[bay.x,t+(h-2*t)*n/(bay.shelves+1),0],[bay.width,d-2*t]);
  for(const sign of [-1,1]) {
    add('front','Front',[(w-2*t)/2-.003,h-2*t,t],[sign*(w-2*t)/4,h/2,d/2-t/2],[h-2*t,(w-2*t)/2-.003],0xd8b788);
    add('handle','Handle',[.015,.12,.025],[sign*.04,h*.55,d/2+.012],null,0x3e463d);
  }
  const material=cabinetMaterials[item.material??'oak'];
  for(const part of parts) if(part.cut) part.color=material.color;
  return parts;
}
export function cabinetBom(item) {
  const stock=validateStock(item),rows=[];let handles=0;
  for(const piece of cabinetParts(item)) {
    if(!piece.cut) {handles++;continue;}
    const [length,width]=piece.cut;
    const existing=rows.find(row=>row.part===piece.part && row.length===length && row.width===width);
    if(existing) existing.quantity++;
    else rows.push({part:piece.part,label:piece.label,quantity:1,length,width,thickness:item.thickness});
  }
  for(const row of rows) {row.area=row.quantity*row.length*row.width;row.volume=row.area*row.thickness;row.blankLength=row.length+(item.lengthAllowanceMm??0)/1000;row.blankWidth=row.width+(item.widthAllowanceMm??0)/1000;row.blankArea=row.quantity*row.blankLength*row.blankWidth;row.material=cabinetMaterials[item.material??'oak'].label;row.stockFit=panelStockFit(row.blankLength,row.blankWidth,stock);}
  return {stock,allFit:rows.every(r=>r.stockFit!=='oversize'),oversizeCount:rows.filter(r=>r.stockFit==='oversize').reduce((n,r)=>n+r.quantity,0),blankArea:rows.reduce((n,r)=>n+r.blankArea,0),rows,handles,panelCount:rows.reduce((n,r)=>n+r.quantity,0),area:rows.reduce((n,r)=>n+r.area,0),volume:rows.reduce((n,r)=>n+r.volume,0)};
}
const csvCell=value=>{const text=String(value),safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return '"'+safe.replace(/"/g,'""')+'"';};
export function cabinetBomCsv(item) {
  const bom=cabinetBom(item);
  const rows=[['cabinet','part','quantity','length_mm','width_mm','thickness_mm','area_m2','volume_m3','material','blank_length_mm','blank_width_mm','blank_area_m2','stock_length_mm','stock_width_mm','edge_trim_mm','rotation_allowed','stock_fit']];
  for(const row of bom.rows) rows.push([item.name,row.label,row.quantity,(row.length*1000).toFixed(3),(row.width*1000).toFixed(3),(row.thickness*1000).toFixed(3),row.area.toFixed(6),row.volume.toFixed(9),row.material,(row.blankLength*1000).toFixed(3),(row.blankWidth*1000).toFixed(3),row.blankArea.toFixed(6),bom.stock.stockLengthMm,bom.stock.stockWidthMm,bom.stock.stockTrimMm,bom.stock.stockAllowRotation,row.stockFit]);
  rows.push([item.name,'Handle',bom.handles,...Array(14).fill('')]);
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
