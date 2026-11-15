import {cabinetBom,cabinetMaterials} from './cabinet-parts.mjs';
import {validateStock} from './stock.mjs';
import {packPanels} from './nesting.mjs';
export function manufacturingBatches(furniture) {
  const groups=new Map();
  const cabinets=[...furniture].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  cabinets.forEach((item,index)=>{
    const stock=validateStock(item),material=item.material??'oak';
    const key=JSON.stringify([material,item.thickness,stock.stockLengthMm,stock.stockWidthMm,stock.stockTrimMm,stock.stockAllowRotation,stock.stockKerfMm]);
    if(!groups.has(key))groups.set(key,{key,material,materialLabel:cabinetMaterials[material].label,thickness:item.thickness,stock,cabinets:[],panels:[]});
    const group=groups.get(key);group.cabinets.push({id:item.id,name:item.name,code:'C'+(index+1)});
    for(const row of cabinetBom(item).rows)for(let n=1;n<=row.quantity;n++){
      const part=row.part+'-'+n;
      group.panels.push({id:item.id+':'+part,shortId:'C'+(index+1)+':'+part,cabinetId:item.id,cabinetName:item.name,part,label:row.label,length:row.blankLength*1000,width:row.blankWidth*1000});
    }
  });
  return [...groups.values()].sort((a,b)=>a.key<b.key?-1:1).map((group,i)=>{
    const layout=packPanels(group.panels,group.stock);
    return {number:i+1,material:group.material,materialLabel:group.materialLabel,thickness:group.thickness,cabinets:group.cabinets,panelCount:group.panels.length,layout};
  });
}
const cell=value=>'"'+String(value).replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
export function manufacturingCsv(furniture) {
  const rows=[['batch','material','thickness_mm','cabinet_id','cabinet','panel','sheet','x_mm','y_mm','width_mm','height_mm','rotated','status','stock_length_mm','stock_width_mm','trim_mm','kerf_mm','rotation_allowed']];
  for(const b of manufacturingBatches(furniture)){
    const s=b.layout.stock;
    const add=(p,sheet,status)=>rows.push([b.number,b.materialLabel,(b.thickness*1000).toFixed(3),p.cabinetId,p.cabinetName,p.part,sheet,p.x?.toFixed(3)??'',p.y?.toFixed(3)??'',(status==='placed'?p.width:p.length).toFixed(3),(status==='placed'?p.height:p.width).toFixed(3),p.rotated??'',status,s.stockLengthMm,s.stockWidthMm,s.stockTrimMm,s.stockKerfMm,s.stockAllowRotation]);
    for(const sheet of b.layout.sheets)for(const p of sheet.panels)add(p,sheet.number,'placed');
    for(const p of b.layout.unplaced)add(p,'','oversize');
  }
  return rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
