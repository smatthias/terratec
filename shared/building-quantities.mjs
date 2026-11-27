import {validateProject} from './project.mjs';
import {roomEntries} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {floorPlanLayout} from './room-placement.mjs';
const sum=(items,key)=>items.reduce((total,item)=>total+item[key],0);
function roomQuantities(entry) {
  const room=entry.room,outline=room.outline,origin=outline[0];let area=0,perimeter=0;
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    area+=(a.x-origin.x)*(b.z-origin.z)-(b.x-origin.x)*(a.z-origin.z);
    perimeter+=Math.hypot(b.x-a.x,b.z-a.z);
  }
  area=Math.abs(area)/2;
  const openingArea=room.openings.reduce((n,o)=>n+o.width*o.height,0),grossWallFaceArea=perimeter*room.height;
  return {id:entry.id,name:entry.name,floorArea:area,interiorVolume:area*room.height,perimeter,grossWallFaceArea,openingArea,netWallFaceArea:grossWallFaceArea-openingArea,
    doorRecords:room.openings.filter(o=>o.type==='door').length,windowRecords:room.openings.filter(o=>o.type==='window').length,
    cabinetInstances:room.furniture.filter(f=>f.type==='cabinet').length,designInstances:room.furniture.filter(f=>f.type==='design').length};
}
export function buildingQuantities(input) {
  const project=validateProject(input),entries=roomEntries(project),rooms=entries.map(roomQuantities),overlaps=floorPlanLayout(entries).overlaps,adjacencies=roomAdjacencies(entries),links=project.openingLinks??[];
  const linkedDoors=links.filter(link=>entries.find(r=>r.id===link.a.roomId).room.openings.find(o=>o.id===link.a.openingId).type==='door').length;
  const linkedWindows=links.length-linkedDoors,perimeterSum=sum(rooms,'perimeter'),sharedSpanSum=sum(adjacencies,'length'),blocked=overlaps.length>0;
  const totals={roomCount:rooms.length,roomAreaSum:sum(rooms,'floorArea'),roomVolumeSum:sum(rooms,'interiorVolume'),perimeterSum,
    combinedFloorArea:blocked?null:sum(rooms,'floorArea'),combinedInteriorVolume:blocked?null:sum(rooms,'interiorVolume'),
    sharedBoundaryLength:blocked?null:sharedSpanSum,uniqueBoundaryLength:blocked?null:perimeterSum-sharedSpanSum,exposedBoundaryLength:blocked?null:perimeterSum-2*sharedSpanSum,
    grossWallFaceArea:sum(rooms,'grossWallFaceArea'),openingFaceArea:sum(rooms,'openingArea'),netWallFaceArea:sum(rooms,'netWallFaceArea'),
    doorRecords:sum(rooms,'doorRecords'),windowRecords:sum(rooms,'windowRecords'),linkedDoorPairs:linkedDoors,linkedWindowPairs:linkedWindows,
    logicalDoors:sum(rooms,'doorRecords')-linkedDoors,logicalWindows:sum(rooms,'windowRecords')-linkedWindows,
    cabinetInstances:sum(rooms,'cabinetInstances'),designInstances:sum(rooms,'designInstances')};
  return {format:'terratec-building-quantities',version:1,projectName:project.name,units:{length:'m',area:'m²',volume:'m³'},status:blocked?'overlapping-rooms':'non-overlapping-rooms',rooms,totals,overlaps,
    scope:[
      'Room sums remain available even when rooms overlap; combined floor/volume and boundary quantities are withheld until overlaps are resolved. No polygon union or overlap subtraction is performed.',
      'Boundary lengths use room interior outlines and adjacency tolerance; they exclude wall thickness, roofs, floors, elevations and structural/material quantities.',
      'Wall-face areas count each room-facing surface, including both sides of a shared wall. Opening areas are deducted on each face; these are finish areas, not unique wall construction areas.',
      'Only explicit opening links reduce logical door/window counts. Unlinked records are counted separately, even if coincident. Furniture counts are placed instances, not a manufacturing bill of materials.'
    ]};
}
export function buildingQuantitiesJson(project) {return JSON.stringify(buildingQuantities(project),null,2)+'\n';}
const cell=value=>'"'+String(typeof value==='string'?value.replace(/^[=+\-@\t\r]/,"'$&"):value??'').replace(/"/g,'""')+'"';
export function buildingQuantitiesCsv(project) {
  const q=buildingQuantities(project),t=q.totals;
  const rows=[['Project',q.projectName],['Status',q.status],[],['Metric','Value','Unit','Status']];
  const metrics={roomCount:'count',roomAreaSum:'m²',roomVolumeSum:'m³',combinedFloorArea:'m²',combinedInteriorVolume:'m³',perimeterSum:'m',sharedBoundaryLength:'m',uniqueBoundaryLength:'m',exposedBoundaryLength:'m',grossWallFaceArea:'m²',openingFaceArea:'m²',netWallFaceArea:'m²',doorRecords:'count',windowRecords:'count',linkedDoorPairs:'count',linkedWindowPairs:'count',logicalDoors:'count',logicalWindows:'count',cabinetInstances:'count',designInstances:'count'};
  for(const [key,unit] of Object.entries(metrics)) rows.push([key,t[key],unit,t[key]===null?'withheld-overlapping-rooms':'available']);
  rows.push([],['Room ID','Room name','Floor area m²','Interior volume m³','Perimeter m','Gross wall-face area m²','Opening area m²','Net wall-face area m²','Door records','Window records','Cabinet instances','Design instances']);
  for(const room of q.rooms)rows.push([room.id,room.name,room.floorArea,room.interiorVolume,room.perimeter,room.grossWallFaceArea,room.openingArea,room.netWallFaceArea,room.doorRecords,room.windowRecords,room.cabinetInstances,room.designInstances]);
  rows.push([],['Overlapping room A','Overlapping room B']);for(const pair of q.overlaps)rows.push([pair.a,pair.b]);
  rows.push([],['Scope']);for(const note of q.scope)rows.push([note]);
  return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
