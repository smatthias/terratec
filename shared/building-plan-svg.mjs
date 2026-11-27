import {validateProject} from './project.mjs';
import {roomEntries} from './project-rooms.mjs';
import {floorPlanLayout,placedRoomPoint} from './room-placement.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {openingConnectionSegments} from './opening-connections.mjs';
import {wallSegment} from './room-topology.mjs';
import {doorPose} from './openings.mjs';
const escape=value=>String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu,'\uFFFD').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const n=value=>Number(value.toFixed(8));
const xy=p=>n(p.x)+' '+n(p.z);
function openingSymbol(entry,opening) {
  const wall=wallSegment(entry.room,opening.wall),at=(along,inset=0)=>placedRoomPoint({x:wall.a.x+wall.tx*along-wall.tz*inset,z:wall.a.z+wall.tz*along+wall.tx*inset},entry.placement);
  const start=at(opening.offset),end=at(opening.offset+opening.width),symbol={roomId:entry.id,openingId:opening.id,type:opening.type,start,end,width:opening.width,bounds:[start,end]};
  if(opening.type==='window') {
    symbol.lines=[-.04,.04].map(inset=>({start:at(opening.offset,inset),end:at(opening.offset+opening.width,inset)}));
    symbol.bounds.push(...symbol.lines.flatMap(line=>[line.start,line.end]));
  } else {
    const pose=doorPose(opening),hinge=at(pose.hingeAlong),closed=at(pose.hingeAlong+pose.hingeSign*opening.width),leaf=at(pose.hingeAlong,pose.swingSign*opening.width);
    Object.assign(symbol,{hinge,closed,leaf,sweep:pose.hingeSign*pose.swingSign>0?1:0});
    symbol.bounds.push(hinge,closed,leaf);
    // Exact extrema of the rotated quarter circle, so an outward swing cannot be clipped.
    for(const axis of ['x','z']) {
      const u=(closed[axis]-hinge[axis])/opening.width,v=(leaf[axis]-hinge[axis])/opening.width;
      for(const raw of [Math.atan2(v,u),Math.atan2(v,u)+Math.PI]) {
        const theta=(raw+2*Math.PI)%(2*Math.PI);
        if(theta>0&&theta<Math.PI/2) symbol.bounds.push({x:hinge.x+(closed.x-hinge.x)*Math.cos(theta)+(leaf.x-hinge.x)*Math.sin(theta),z:hinge.z+(closed.z-hinge.z)*Math.cos(theta)+(leaf.z-hinge.z)*Math.sin(theta)});
      }
    }
  }
  return symbol;
}
export function buildingPlanDrawing(input,{scale=null}={}) {
  if(scale!==null&&![20,50,100,200].includes(scale)) throw Error('Building SVG scale must be 1:20, 1:50, 1:100, 1:200 or unscaled');
  const project=validateProject(input),entries=roomEntries(project),layout=floorPlanLayout(entries),links=project.openingLinks??[],skip=new Set(links.map(link=>link.b.roomId+':'+link.b.openingId));
  const openings=entries.flatMap(entry=>entry.room.openings.filter(o=>!skip.has(entry.id+':'+o.id)).map(o=>openingSymbol(entry,o)));
  const points=[...layout.rooms.flatMap(room=>room.outline),...openings.flatMap(o=>o.bounds)],xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),span=Math.max(maxX-minX,maxZ-minZ);
  const font=scale?2.5*scale/1000:Math.max(.12,span/70),stroke=scale ? .18*scale/1000 :Math.max(.008,span/1000),margin=Math.max(.25,font*4,span*.03);
  const bounds={x:minX-margin,z:minZ-margin-font*4,width:maxX-minX+margin*2,height:maxZ-minZ+margin*2+font*10};
  return {projectName:project.name,rooms:layout.rooms,openings,openingRecords:entries.reduce((count,entry)=>count+entry.room.openings.length,0),connections:openingConnectionSegments(entries,links),adjacencies:roomAdjacencies(entries),overlaps:layout.overlaps,bounds,font,stroke,scale};
}
export function buildingPlanSheetLayout(project,{scale=null,paper='auto',orientation='landscape'}={}) {
  if(!['auto','A4','A3'].includes(paper)||!['portrait','landscape'].includes(orientation)) throw Error('Choose drawing bounds, A4/A3 paper and portrait/landscape orientation');
  if(paper!=='auto'&&scale===null) throw Error('Choose a print scale for A4/A3 building sheets');
  const drawing=buildingPlanDrawing(project,{scale});
  if(paper==='auto') return {paper,orientation,scale,fits:true,suggestedScale:null,drawing};
  const dimensions=paper==='A4'?[210,297]:[297,420],width=orientation==='portrait'?dimensions[0]:dimensions[1],height=orientation==='portrait'?dimensions[1]:dimensions[0],margin=10;
  const usableWidth=width-2*margin,usableHeight=height-2*margin;
  const dimensionsOf=(drawing,denominator)=>({requiredWidth:drawing.bounds.width*1000/denominator,requiredHeight:drawing.bounds.height*1000/denominator});
  const size=dimensionsOf(drawing,scale),fitsSize=size=>size.requiredWidth<=usableWidth+1e-7&&size.requiredHeight<=usableHeight+1e-7,fits=fitsSize(size);
  const suggestedScale=fits?null:[20,50,100,200].find(denominator=>fitsSize(dimensionsOf(buildingPlanDrawing(project,{scale:denominator}),denominator)))??null;
  return {paper,orientation,scale,width,height,margin,usableWidth,usableHeight,...size,fits,suggestedScale,drawing};
}
export function exportBuildingPlanSvg(project,options={}) {
  const sheet=buildingPlanSheetLayout(project,options);
  if(!sheet.fits) throw Error('Building drawing does not fit '+sheet.paper+' '+sheet.orientation+' at 1:'+sheet.scale+(sheet.suggestedScale?'; try 1:'+sheet.suggestedScale:'; use drawing bounds or change scale/paper'));
  const drawing=sheet.drawing,{rooms,openings,connections,adjacencies,overlaps,bounds:b,font,stroke,scale}=drawing;
  const conflict=new Set(overlaps.flatMap(pair=>[pair.a,pair.b])),items=[];
  const line=(a,b,attributes='')=>`<line x1="${n(a.x)}" y1="${n(a.z)}" x2="${n(b.x)}" y2="${n(b.z)}" ${attributes}/>`;
  const text=(x,y,value,size=font,attributes='')=>`<text x="${n(x)}" y="${n(y)}" font-family="sans-serif" font-size="${n(size)}" ${attributes}>${escape(value)}</text>`;
  for(const room of rooms)items.push(`<g data-room-id="${escape(room.id)}"><title>${escape(room.name)}</title><polygon points="${room.outline.map(p=>n(p.x)+','+n(p.z)).join(' ')}" fill="${conflict.has(room.id)?'#f2d3c9':'#edf2e8'}" stroke="#354b43" stroke-width="${n(stroke)}"/></g>`);
  items.push(`<g data-layer="adjacency" stroke="#087e94" stroke-width="${n(stroke*2)}">${adjacencies.map(a=>line(a.start,a.end,`data-adjacency-id="${escape(a.id)}"`)).join('')}</g>`);
  for(const opening of openings) {
    const mask=line(opening.start,opening.end,`stroke="white" stroke-width="${n(Math.max(.12,stroke*4))}"`);
    const symbol=opening.type==='window'?opening.lines.map(l=>line(l.start,l.end)).join(''):line(opening.hinge,opening.leaf)+`<path d="M ${xy(opening.closed)} A ${n(opening.width)} ${n(opening.width)} 0 0 ${opening.sweep} ${xy(opening.leaf)}"/>`;
    items.push(`<g data-opening-type="${opening.type}" data-room-id="${escape(opening.roomId)}" data-opening-id="${escape(opening.openingId)}">${mask}<g fill="none" stroke="#354b43" stroke-width="${n(stroke)}">${symbol}</g></g>`);
  }
  items.push(`<g data-layer="connections" stroke="#278130" stroke-width="${n(stroke*2.5)}">${connections.map(c=>`<g data-connection-id="${escape(c.id)}"><title>${escape(c.label)}</title>${line(c.start,c.end)}</g>`).join('')}</g>`);
  for(const room of rooms)items.push(text(room.centre.x,room.centre.z,room.name,font,'text-anchor="middle" dominant-baseline="middle"'));
  const left=b.x+marginOf(drawing),bottom=b.z+b.height-font*5;
  const scaleLabel=scale?'1:'+scale+' · print at 100%, without fit-to-page':'unscaled vector';
  const footer=[`${rooms.length} rooms · ${connections.length} linked opening pairs · ${overlaps.length} overlapping pairs · ${scaleLabel}`,'World coordinates in metres. Cyan: adjacent wall spans. Green: linked openings; paired symbols drawn once.','Interior boundaries and independent room meshes; wall thickness and structural checks are excluded.',overlaps.length?'Warning: overlapping rooms are shown without merging geometry.':'Door/window symbols are illustrative; this is not a BIM or manufacturing interchange.'];
  for(let i=0;i<footer.length;i++)items.push(text(left,bottom+i*font,footer[i],font*.75,`textLength="${n(Math.min(footer[i].length*font*.42,b.width-font*2))}" lengthAdjust="spacingAndGlyphs"`));
  const title=drawing.projectName+' · Building floor plan';
  const width=scale?n(b.width*1000/scale)+'mm':'1200px',height=scale?n(b.height*1000/scale)+'mm':n(1200*b.height/b.width)+'px';
  const metadata={format:'terratec-building-plan',version:1,units:'m',scale,rooms:rooms.length,openingRecords:drawing.openingRecords,openingSymbols:openings.length,linkedOpeningPairs:connections.length,overlappingPairs:overlaps.length};
  const content=`<rect x="${n(b.x)}" y="${n(b.z)}" width="${n(b.width)}" height="${n(b.height)}" fill="white"/>${text(left,b.z+font*2,title,font*1.4,`textLength="${n(Math.min(title.length*font*.8,b.width-font*2))}" lengthAdjust="spacingAndGlyphs"`)}${items.join('')}`;
  if(sheet.paper!=='auto') {
    const factor=1000/scale,x=sheet.margin+(sheet.usableWidth-sheet.requiredWidth)/2,y=sheet.margin+(sheet.usableHeight-sheet.requiredHeight)/2;
    const sheetMetadata={...metadata,paper:sheet.paper,orientation:sheet.orientation,marginMm:sheet.margin};
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}" data-paper-size="${sheet.paper}" data-orientation="${sheet.orientation}" data-print-scale="1:${scale}" role="img"><title>${escape(title)} · ${sheet.paper} ${sheet.orientation} · 1:${scale}</title><metadata>${escape(JSON.stringify(sheetMetadata))}</metadata><rect width="${sheet.width}" height="${sheet.height}" fill="white"/><g data-building-plan="true" transform="translate(${n(x)} ${n(y)}) scale(${n(factor)}) translate(${n(-b.x)} ${n(-b.z)})">${content}</g><rect x="10" y="10" width="${sheet.usableWidth}" height="${sheet.usableHeight}" fill="none" stroke="#354b43" stroke-width="0.2"/><text x="10" y="${sheet.height-5}" font-family="sans-serif" font-size="2.5">TerraTec · ${sheet.paper} ${sheet.orientation} · 1:${scale} · Print at 100% without fit-to-page</text></svg>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(b.x)} ${n(b.z)} ${n(b.width)} ${n(b.height)}" data-print-scale="${scale?'1:'+scale:'unscaled'}" role="img"><title>${escape(title)}</title><metadata>${escape(JSON.stringify(metadata))}</metadata>${content}</svg>\n`;
}
const marginOf=drawing=>Math.max(drawing.font,drawing.bounds.width*.02);
