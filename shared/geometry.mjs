export const edgeIds = ['north','east','south','west'];
export const rectangle = (width, depth) => [
  {x:-width/2,z:-depth/2},{x:width/2,z:-depth/2},
  {x:width/2,z:depth/2},{x:-width/2,z:depth/2}
];
export function bounds(outline) {
  const xs=outline.map(p=>p.x), zs=outline.map(p=>p.z);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minZ=Math.min(...zs), maxZ=Math.max(...zs);
  return {width:maxX-minX,depth:maxZ-minZ,x:(minX+maxX)/2,z:(minZ+maxZ)/2,minX,maxX,minZ,maxZ};
}
export function validateOutline(outline) {
  if (!Array.isArray(outline) || outline.length !== 4 || !outline.every(p => p &&
    [p.x,p.z].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v)<=1000)))
    throw Error('Room needs four corners with finite coordinates between -1000 and 1000 m');
  const b=bounds(outline);
  if (b.width<.1 || b.depth<.1 || b.width>1000 || b.depth>1000) throw Error('Room span must be between 0.1 and 1000 m');
  for(let i=0;i<4;i++) {
    const a=outline[i], b=outline[(i+1)%4], c=outline[(i+2)%4];
    if(Math.hypot(b.x-a.x,b.z-a.z)<.1-1e-9 || (b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x)<=1e-8)
      throw Error('Corners must form a convex room in clockwise plan order, with walls at least 0.1 m long');
  }
  return outline.map(({x,z})=>({x,z}));
}
export function snapPoint(point, spacing, enabled=true) {
  if(![point.x,point.z,spacing].every(v=>typeof v==='number' && Number.isFinite(v)) || spacing<=0)
    throw Error('Enter finite endpoint coordinates and a positive grid spacing');
  const snap=v=>enabled ? Number((Math.round(v/spacing)*spacing).toFixed(8)) : v;
  return {x:snap(point.x),z:snap(point.z)};
}
export function moveCorner(outline,index,point,spacing,enabled) {
  const next=outline.map(p=>({...p}));
  next[index]=snapPoint(point,spacing,enabled);
  return validateOutline(next);
}
export function scaleOutline(outline,axis,size) {
  const b=bounds(outline), span=axis==='x'?b.width:b.depth;
  return validateOutline(outline.map(p=>({...p,[axis]:b[axis]+(p[axis]-b[axis])*size/span})));
}
