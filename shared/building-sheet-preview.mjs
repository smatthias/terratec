import {buildingPlanSheetLayout,exportBuildingPlanSvg} from './building-plan-svg.mjs';
const escape=value=>String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu,'\uFFFD').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildingSheetPreview(project,options={}) {
  if(!['A4','A3'].includes(options.paper)) throw Error('Choose A4 or A3 for a printable building-sheet preview');
  const sheet=buildingPlanSheetLayout(project,options);
  if(!sheet.fits&&!options.tiled) throw Error('Building sheet does not fit '+sheet.paper+' '+sheet.orientation+' at 1:'+sheet.scale+'; choose a fitting scale before previewing');
  const tiles=options.tiled?buildingSheetTiles(sheet):[{row:1,column:1}];
  const source=options.tiled?exportBuildingPlanSvg(project,{scale:sheet.scale}):null;
  const pages=tiles.map((tile,index)=>{
    if(!options.tiled)return exportBuildingPlanSvg(project,options).replace(/^<\?xml[^?]*\?>\s*/,'');
    const viewport=[tile.x,tile.z,sheet.usableWidth*sheet.scale/1000,sheet.usableHeight*sheet.scale/1000].join(' ');
    const content=source.replace(/^<\?xml[^?]*\?>\s*<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}" data-print-scale="1:${sheet.scale}"><rect width="100%" height="100%" fill="white"/><svg x="10" y="10" width="${sheet.usableWidth}" height="${sheet.usableHeight}" viewBox="${viewport}" overflow="hidden">${content}</svg><rect x="10" y="10" width="${sheet.usableWidth}" height="${sheet.usableHeight}" fill="none" stroke="#354b43" stroke-width="0.2"/><text x="10" y="${sheet.height-5}" font-family="sans-serif" font-size="2.5">TerraTec · 1:${sheet.scale} · Page ${index+1}/${tiles.length} · Row ${tile.row}, column ${tile.column} · 10 mm overlap</text></svg>`;
  });
  const title=sheet.drawing.projectName+' · '+sheet.paper+' '+sheet.orientation+' · 1:'+sheet.scale;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>@page{size:${sheet.paper} ${sheet.orientation};margin:0}*{box-sizing:border-box}body{margin:0;color:#263e3c;font:13px/1.5 Arial,sans-serif}.sheet{width:${sheet.width}mm;height:${sheet.height}mm;margin:0 auto;background:white;break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet>svg{display:block;width:100%;height:100%}.preview-note{margin:0 auto 12px;max-width:${sheet.width}mm;overflow-wrap:anywhere}@media screen{body{padding:16px;background:#dce3dc}.sheet{max-width:100%;height:auto;box-shadow:0 2px 12px #0003}.sheet>svg{width:100%;height:auto}}@media print{html,body{margin:0;padding:0;background:white}.preview-note{display:none!important}.sheet{width:${sheet.width}mm;height:${sheet.height}mm;max-width:none;margin:0;box-shadow:none}.sheet>svg{width:100%;height:100%}}</style></head><body><aside class="preview-note"><strong>${escape(title)}</strong><br>Snapshot. The screen preview fits its window; printing retains the selected physical scale. Print at 100% without fit-to-page, additional margins or browser headers/footers.</aside>${pages.map((page,index)=>`<main class="sheet" aria-label="Printable building sheet ${index+1}">${page}</main>`).join('')}</body></html>`;
  return {format:'terratec-building-sheet-preview',version:1,projectName:sheet.drawing.projectName,paper:sheet.paper,orientation:sheet.orientation,scale:sheet.scale,width:sheet.width,height:sheet.height,pageCount:pages.length,tiles:options.tiled?tiles:null,html};
}

// Tile origins are in world metres. Every neighbouring sheet shares 10 mm.
export function buildingSheetTiles(sheet) {
  const overlap=10,columns=Math.max(1,Math.ceil((sheet.requiredWidth-overlap-1e-7)/(sheet.usableWidth-overlap))),rows=Math.max(1,Math.ceil((sheet.requiredHeight-overlap-1e-7)/(sheet.usableHeight-overlap)));
  if(rows*columns>64)throw Error('Building plan needs more than 64 sheets; choose a smaller print scale or larger paper');
  const tiles=[];
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)tiles.push({row:row+1,column:column+1,x:sheet.drawing.bounds.x+column*(sheet.usableWidth-overlap)*sheet.scale/1000,z:sheet.drawing.bounds.z+row*(sheet.usableHeight-overlap)*sheet.scale/1000});
  return tiles;
}
