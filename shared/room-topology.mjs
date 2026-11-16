// Stable identifiers for the room's fixed-length sets (four corners, four walls).
//
// The outline always holds exactly four corners in clockwise plan order, so an
// ID is bound to a position in that set, not to a compass bearing. Like the wall
// IDs, a corner keeps its ID through drags, scaling and rotation of the room.
// IDs are derived, never stored: saved projects, fixtures and manifest hashes are
// unchanged.
//
// Topology: wall i runs from corner i (end A) to corner i+1 (end B), so corner i
// joins the wall ending there (incoming) and the wall starting there (outgoing).
//
//        north-west ──── north ────▶ north-east
//            ▲                            │
//          west                         east
//            │                            ▼
//        south-west ◀──── south ──── south-east
export const WALL_IDS=Object.freeze(['north','east','south','west']);
export const CORNER_IDS=Object.freeze(['north-west','north-east','south-east','south-west']);

const capitalise=id=>id[0].toUpperCase()+id.slice(1);
function position(ids,id,kind) {
  const index=ids.indexOf(id);
  if(index<0) throw Error('Unknown '+kind);
  return index;
}
const at=(ids,index)=>ids[(index%ids.length+ids.length)%ids.length];

export const isWallId=id=>WALL_IDS.includes(id);
export const isCornerId=id=>CORNER_IDS.includes(id);
export const wallIndex=id=>position(WALL_IDS,id,'wall');
export const cornerIndex=id=>position(CORNER_IDS,id,'corner');
export const wallLabel=id=>capitalise(WALL_IDS[wallIndex(id)])+' wall';
export const cornerLabel=id=>capitalise(CORNER_IDS[cornerIndex(id)])+' corner';

// Clockwise navigation; negative steps walk anticlockwise.
export const nextWall=(id,steps=1)=>at(WALL_IDS,wallIndex(id)+steps);
export const nextCorner=(id,steps=1)=>at(CORNER_IDS,cornerIndex(id)+steps);
export const oppositeWall=id=>nextWall(id,2);
export const oppositeCorner=id=>nextCorner(id,2);

export function wallCorners(wall) {
  const index=wallIndex(wall);
  return {a:CORNER_IDS[index],b:at(CORNER_IDS,index+1)};
}
export function cornerWalls(corner) {
  const index=cornerIndex(corner);
  return {incoming:at(WALL_IDS,index-1),outgoing:WALL_IDS[index]};
}

function checkOutline(outline) {
  if(!Array.isArray(outline) || outline.length!==CORNER_IDS.length) throw Error('Room outline needs four corners');
  return outline;
}
export function cornerPoint(outline,corner) {
  const {x,z}=checkOutline(outline)[cornerIndex(corner)];
  return {x,z};
}
// Unit direction (tx, tz) runs A → B; the inward normal (nx, nz) points into the room.
export function wallSegment(outline,wall) {
  const corners=wallCorners(wall),a=cornerPoint(outline,corners.a),b=cornerPoint(outline,corners.b);
  const length=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/length,tz=(b.z-a.z)/length;
  return {id:wall,corners,a,b,length,tx,tz,nx:-tz,nz:tx};
}
export const roomWalls=outline=>WALL_IDS.map(id=>wallSegment(outline,id));
// Interior angle in degrees between the two walls that meet at the corner.
export function roomCorners(outline) {
  return CORNER_IDS.map(id=>{
    const point=cornerPoint(outline,id),before=cornerPoint(outline,nextCorner(id,-1)),after=cornerPoint(outline,nextCorner(id));
    const u={x:before.x-point.x,z:before.z-point.z},v={x:after.x-point.x,z:after.z-point.z};
    const cosine=(u.x*v.x+u.z*v.z)/(Math.hypot(u.x,u.z)*Math.hypot(v.x,v.z));
    return {id,...point,walls:cornerWalls(id),interiorAngle:Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI};
  });
}
