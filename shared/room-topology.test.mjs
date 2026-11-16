import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WALL_IDS,CORNER_IDS,wallCorners,cornerWalls,cornerPoint,wallSegment,roomWalls,roomCorners,nextWall,nextCorner,oppositeWall,oppositeCorner,wallIndex,cornerIndex,wallLabel,cornerLabel,isWallId,isCornerId} from './room-topology.mjs';
import {rectangle,moveCorner,moveCorners,scaleOutline,bounds} from './geometry.mjs';
import {validateProject} from './project.mjs';
import {wallLength,doorPose} from './openings.mjs';
import {CABINET_CORNER_IDS,CABINET_SIDE_IDS,cabinetCorners,cabinetSides,cabinetFootprint} from './furniture.mjs';
import {cabinetServiceZone} from './furniture-clearance.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const rotate=(outline,degrees)=>outline.map(({x,z})=>{const r=degrees*Math.PI/180;return {x:x*Math.cos(r)-z*Math.sin(r),z:x*Math.sin(r)+z*Math.cos(r)};});
const irregular=[{x:-3,z:-2},{x:2.5,z:-2.5},{x:3.5,z:2},{x:-2,z:1.5}];

test('corner and wall ID sets are fixed, frozen and mutually consistent',()=>{
  assert.deepEqual(WALL_IDS,['north','east','south','west']);
  assert.deepEqual(CORNER_IDS,['north-west','north-east','south-east','south-west']);
  assert.ok(Object.isFrozen(WALL_IDS)&&Object.isFrozen(CORNER_IDS));
  for(const wall of WALL_IDS){
    const {a,b}=wallCorners(wall);
    assert.equal(cornerWalls(a).outgoing,wall,'a wall starts at its A corner');
    assert.equal(cornerWalls(b).incoming,wall,'a wall ends at its B corner');
  }
  assert.deepEqual(wallCorners('north'),{a:'north-west',b:'north-east'});
  assert.deepEqual(wallCorners('west'),{a:'south-west',b:'north-west'});
  assert.deepEqual(cornerWalls('north-west'),{incoming:'west',outgoing:'north'});
  assert.deepEqual(cornerWalls('south-east'),{incoming:'east',outgoing:'south'});
  assert.equal(wallLabel('north'),'North wall');assert.equal(cornerLabel('south-west'),'South-west corner');
});

test('initial rectangle corners sit at their named compass positions with inward wall normals',()=>{
  const outline=rectangle(6,4),b=bounds(outline);
  assert.deepEqual(cornerPoint(outline,'north-west'),{x:b.minX,z:b.minZ});
  assert.deepEqual(cornerPoint(outline,'north-east'),{x:b.maxX,z:b.minZ});
  assert.deepEqual(cornerPoint(outline,'south-east'),{x:b.maxX,z:b.maxZ});
  assert.deepEqual(cornerPoint(outline,'south-west'),{x:b.minX,z:b.maxZ});
  for(const wall of roomWalls(outline)){
    const mid={x:(wall.a.x+wall.b.x)/2+wall.nx*.1,z:(wall.a.z+wall.b.z)/2+wall.nz*.1};
    assert.ok(mid.x>b.minX&&mid.x<b.maxX&&mid.z>b.minZ&&mid.z<b.maxZ,wall.id+' normal must point into the room');
  }
  assert.equal(wallSegment(outline,'north').length,6);assert.equal(wallSegment(outline,'east').length,4);
});

test('IDs stay bound to the same corner through drags, endpoint edits, scaling and rotation',()=>{
  const moved=moveCorner(rectangle(6,4),'south-east',{x:3.5,z:2.5},.25,true);
  assert.deepEqual(cornerPoint(moved,'south-east'),{x:3.5,z:2.5});
  assert.deepEqual(cornerPoint(moved,'north-west'),{x:-3,z:-2},'other corners are untouched');
  const scaled=scaleOutline(moved,'x',10);
  assert.ok(cornerPoint(scaled,'south-east').x>cornerPoint(scaled,'south-west').x);
  // A rotated room keeps its IDs: they are identities, not compass bearings.
  const turned=rotate(rectangle(6,4),90);
  assert.deepEqual(wallCorners('north'),{a:'north-west',b:'north-east'});
  close(wallSegment(turned,'north').length,6);
  close(cornerPoint(turned,'north-west').x,turned[0].x);close(cornerPoint(turned,'north-west').z,turned[0].z);
  const edited=moveCorners(rectangle(6,4),{'north-west':{x:-3.3,z:-2.1},'north-east':{x:3.1,z:-2.4}},.25,false);
  assert.deepEqual([cornerPoint(edited,'north-west'),cornerPoint(edited,'north-east')],[{x:-3.3,z:-2.1},{x:3.1,z:-2.4}]);
});

test('moving corners by ID validates atomically and never mutates its input',()=>{
  const original=rectangle(6,4),copy=JSON.parse(JSON.stringify(original));
  assert.throws(()=>moveCorners(original,{'north-west':{x:-3,z:-2},'north-east':{x:-3,z:-2}},.25,false),/convex room/);
  assert.throws(()=>moveCorner(original,0,{x:-3,z:-2},.25,false),/Unknown corner/,'positional indexes are no longer accepted');
  assert.throws(()=>moveCorner(original,'northwest',{x:-3,z:-2},.25,false),/Unknown corner/);
  assert.deepEqual(original,copy);
});

test('clockwise navigation wraps, walks backwards and finds opposites',()=>{
  assert.equal(nextWall('west'),'north');assert.equal(nextWall('north',-1),'west');
  assert.equal(nextCorner('south-west'),'north-west');assert.equal(nextCorner('north-west',-1),'south-west');
  assert.equal(nextCorner('north-east',4),'north-east');assert.equal(nextWall('east',-6),'west');
  assert.equal(oppositeWall('north'),'south');assert.equal(oppositeWall('east'),'west');
  assert.equal(oppositeCorner('north-west'),'south-east');assert.equal(oppositeCorner('north-east'),'south-west');
  // Walking corner → outgoing wall → B corner is one clockwise corner step.
  for(const corner of CORNER_IDS) assert.equal(wallCorners(cornerWalls(corner).outgoing).b,nextCorner(corner));
});

test('unknown IDs are rejected, including stale positional indexes',()=>{
  for(const bad of [0,1,'0','North',null,undefined,'floor']) {
    assert.throws(()=>wallIndex(bad),/^Error: Unknown wall$/);
    assert.throws(()=>cornerIndex(bad),/^Error: Unknown corner$/);
    assert.equal(isWallId(bad),false);assert.equal(isCornerId(bad),false);
  }
  assert.throws(()=>wallLength(rectangle(6,4),'ceiling'),/Unknown wall/);
  assert.throws(()=>cornerPoint(rectangle(6,4).slice(0,3),'north-west'),/four corners/);
});

test('corner descriptors report joining walls and interior angles for corner situations',()=>{
  const corners=roomCorners(rectangle(6,4));
  assert.deepEqual(corners.map(c=>c.id),[...CORNER_IDS]);
  for(const c of corners) close(c.interiorAngle,90);
  assert.deepEqual(corners[0].walls,{incoming:'west',outgoing:'north'});
  const skew=roomCorners(irregular);
  close(skew.reduce((n,c)=>n+c.interiorAngle,0),360);
  assert.ok(skew.every(c=>c.interiorAngle>0&&c.interiorAngle<180));
});

test('wall segments match the legacy index arithmetic on irregular outlines',()=>{
  irregular.forEach((a,i)=>{
    const b=irregular[(i+1)%4],wall=wallSegment(irregular,WALL_IDS[i]);
    assert.deepEqual([wall.a,wall.b],[a,b]);
    close(wall.length,Math.hypot(b.x-a.x,b.z-a.z));close(wallLength(irregular,WALL_IDS[i]),wall.length);
    close(wall.tx*wall.nx+wall.tz*wall.nz,0);
  });
});

test('door hinge end A is the wall A corner',()=>{
  const outline=rectangle(6,4),wall=wallSegment(outline,'east');
  const hinge=doorPose({offset:0,width:.9,hinge:'A'}).hingeAlong;
  assert.deepEqual({x:wall.a.x+wall.tx*hinge,z:wall.a.z+wall.tz*hinge},cornerPoint(outline,'north-east'));
});

test('stable IDs are derived, not stored, so saved projects and hashes are unchanged',()=>{
  const project=validateProject({schemaVersion:6,units:'m',name:'IDs',presets:[],room:{height:3,outline:irregular,openings:[],furniture:[]}});
  assert.deepEqual(project.room.outline,irregular);
  assert.ok(project.room.outline.every(p=>Object.keys(p).join()==='x,z'));
});

test('cabinet footprint corners and sides have stable front/back/left/right IDs',()=>{
  assert.deepEqual(CABINET_CORNER_IDS,['back-left','back-right','front-right','front-left']);
  assert.deepEqual(CABINET_SIDE_IDS,['back','right','front','left']);
  const item={x:1,z:2,width:.8,depth:.5,rotation:0};
  const corners=Object.fromEntries(cabinetCorners(item).map(c=>[c.id,c]));
  assert.deepEqual(corners['back-left'],{id:'back-left',x:.6,z:1.75});
  assert.deepEqual(corners['front-right'],{id:'front-right',x:1.4,z:2.25});
  for(const rotation of [0,37,90,180,270]){
    const rotated={...item,rotation},sides=Object.fromEntries(cabinetSides(rotated).map(s=>[s.id,s]));
    assert.deepEqual(cabinetCorners(rotated).map(({x,z})=>({x,z})),cabinetFootprint(rotated));
    // The front side faces the service zone, wherever the cabinet is rotated.
    const zone=cabinetServiceZone(rotated,.4),zoneCentre={x:zone.reduce((n,p)=>n+p.x,0)/4,z:zone.reduce((n,p)=>n+p.z,0)/4};
    const mid=s=>({x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2}),d=s=>Math.hypot(mid(s).x-zoneCentre.x,mid(s).z-zoneCentre.z);
    assert.ok(d(sides.front)<d(sides.back)&&d(sides.front)<d(sides.left)&&d(sides.front)<d(sides.right),'front at '+rotation);
    assert.deepEqual(sides.front.corners,{a:'front-right',b:'front-left'});
    // Unrotated, the front faces south, so a viewer facing it has east (+x) on their right.
    // Rotation preserves handedness, so right × front keeps that sign at every angle.
    if(rotation===0) assert.ok(mid(sides.right).x>rotated.x&&mid(sides.left).x<rotated.x);
    const cross=(mid(sides.right).x-rotated.x)*(mid(sides.front).z-rotated.z)-(mid(sides.right).z-rotated.z)*(mid(sides.front).x-rotated.x);
    assert.ok(cross>0,'right side at '+rotation);
  }
});
