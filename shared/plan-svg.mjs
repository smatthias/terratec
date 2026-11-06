import {validateProject} from './project.mjs';
import {bounds,edgeIds} from './geometry.mjs';
import {wallPanels,doorPose} from './openings.mjs';
export const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function exportPlanSvg(input) {
  const project=validateProject(input),room=project.room,box=bounds(room.outline),extent=Math.max(box.width,box.depth);
  const font=Math.max(.12,extent/70),stroke=Math.max(.012,extent/1000),offset=Math.max(.4,extent/12),items=[],points=[];
  const point=p=>{points.push(p);return p.x.toFixed(6)+','+p.z.toFixed(6);};
  const line=(a,b,color='#263e3c')=>items.push(`<polyline points="${point(a)} ${point(b)}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
  const poly=(p,fill)=>items.push(`<polygon points="${p.map(point).join(' ')}" fill="${fill}" stroke="#263e3c" stroke-width="${stroke}"/>`);
  const text=(p,value)=>{point(p);items.push(`<text x="${p.x}" y="${p.z}" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="#263e3c">${escapeXml(value)}</text>`);};
  poly(room.outline,'#eef2e9');
  room.outline.forEach((a,i)=>{
    const b=room.outline[(i+1)%4],length=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/length,tz=(b.z-a.z)/length,wall=edgeIds[i];
    const at=(along,inset=0)=>({x:a.x+tx*along-tz*inset,z:a.z+tz*along+tx*inset});
    const openings=room.openings.filter(o=>o.wall===wall).sort((a,b)=>a.offset-b.offset),slice=Math.min(1.2,room.height/2);
    for(const p of wallPanels(length,room.height,openings)) if(p.bottom<=slice && p.top>=slice)
      poly([at(p.left),at(p.right),at(p.right,-.16),at(p.left,-.16)],'#65776c');
    for(const o of openings) {
      if(o.type==='window') {for(const inset of [-.04,-.12]) line(at(o.offset,inset),at(o.offset+o.width,inset),'#287e98');}
      else {
        const pose=doorPose(o),arc=[];
        line(at(pose.hingeAlong),at(pose.hingeAlong,pose.swingSign*o.width),'#8c6529');
        for(let j=0;j<=32;j++) {const angle=j/32*Math.PI/2;arc.push(at(pose.hingeAlong+pose.hingeSign*o.width*Math.cos(angle),pose.swingSign*o.width*Math.sin(angle)));}
        items.push(`<polyline points="${arc.map(point).join(' ')}" fill="none" stroke="#8c6529" stroke-width="${stroke}"/>`);
      }
    }
    const measure=(start,end,distance)=>{
      const p=at(start,-distance),q=at(end,-distance),tick=font*.4;
      line(p,q);line(at(start,-.02),at(start,-distance-font*.3));line(at(end,-.02),at(end,-distance-font*.3));
      for(const s of [start,end]) line(at(s-tick,-distance-tick),at(s+tick,-distance+tick));
      text(at((start+end)/2,-distance-font*.2),(end-start).toFixed(2)+' m');
    };
    measure(0,length,offset*(openings.length?2:1));
    if(openings.length) {const cuts=[0,...openings.flatMap(o=>[o.offset,o.offset+o.width]),length];for(let n=0;n<cuts.length-1;n++) measure(cuts[n],cuts[n+1],offset);}
  });
  const minX=Math.min(...points.map(p=>p.x))-font*3,maxX=Math.max(...points.map(p=>p.x))+font*3;
  const minZ=Math.min(...points.map(p=>p.z))-font*6,maxZ=Math.max(...points.map(p=>p.z))+font*3;
  const width=maxX-minX,height=maxZ-minZ;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${width} ${height}" width="1200" height="${Math.round(1200*height/width)}" role="img"><title>${escapeXml(project.name)} · Plan</title><metadata>TerraTec plan; model coordinates in metres; section height ${sliceHeight(room)} m. Drawing is not assigned a print scale.</metadata><rect x="${minX}" y="${minZ}" width="${width}" height="${height}" fill="white"/><text x="${minX+font}" y="${minZ+font*2}" font-family="sans-serif" font-size="${font*1.5}" textLength="${Math.min(project.name.length*font*.9,width-font*2)}" lengthAdjust="spacingAndGlyphs">${escapeXml(project.name)}</text>${items.join('')}</svg>\n`;
}
function sliceHeight(room) {return Math.min(1.2,room.height/2);}
