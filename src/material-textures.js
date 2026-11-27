// Procedural textures for the material catalogue (materials.mjs), used wherever
// pieces are drawn: the designer, the workshop benches, the CNC machine and the
// room. No image files: every texture is computed into a pixel array (so it also
// builds in tests, without a canvas), repeats seamlessly and is cached.
//
//   faceTexture(material)          the face of a board or profile: wood grain
//                                  along the length (texture x), rotary-cut birch,
//                                  melamine, brushed metal. A grey "tint" pattern
//                                  that multiplies the piece's colour, so a stained
//                                  or painted piece keeps its grain.
//   edgeTexture(material, thickness) an edge across the thickness (texture y from
//                                  face B to face A): plywood plies, a chipboard
//                                  core between its faces, or side grain. Plywood
//                                  and board edges are `baked` (their own colours).
//   endTexture(material)           end grain: growth rings seen from the end.
//   surfaceTexture(kind)           workshop surfaces: mdf, concrete, chipboard,
//                                  plycore (baked) and brushed (tint).
//   projectUVs(geometry, …)        box-projected texture coordinates in mm.
// Texture coordinates are millimetres divided by TILE (END_TILE for end grain).
import * as THREE from 'three';
import {MATERIALS} from '../shared/materials.mjs';

export const TILE=500,END_TILE=120;
const cache=new Map();
const fract=v=>v-Math.floor(v);
const clamp01=v=>v<0?0:v>1?1:v;
const smooth=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};

// Seamless value noise over the unit square with `px` × `py` lattice cells
// (the lattice is hashed once into a table).
function tiling(seed,px,py) {
  const table=new Float32Array(px*py);
  for(let j=0;j<py;j++) for(let i=0;i<px;i++) {let h=Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(seed,2654435761)|0;h=Math.imul(h^(h>>>13),1274126177);table[j*px+i]=((h^(h>>>16))>>>0)/4294967295;}
  return (x,y)=>{
    const X=x*px,Y=y*py,fi=Math.floor(X),fj=Math.floor(Y),fx=X-fi,fy=Y-fj,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    const i=(fi%px+px)%px,j=(fj%py+py)%py,i1=i+1===px?0:i+1,j1=j+1===py?0:j+1;
    const a=table[j*px+i],b=table[j*px+i1],c=table[j1*px+i],d=table[j1*px+i1];
    return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
  };
}
function fbm(seed,px,py,octaves=3) {
  const layers=[],weights=[];let total=0;
  for(let k=0;k<octaves;k++) {layers.push(tiling(seed+k*31,px<<k,py<<k));weights.push(1/(1<<k));total+=1/(1<<k);}
  return (x,y)=>{let sum=0;for(let k=0;k<octaves;k++) sum+=layers[k](x,y)*weights[k];return sum/total;};
}
// Fills a width × height RGBA texture from `pixel(x, y)` → grey or [r, g, b] (0–1).
function build(key,width,height,pixel,{baked=false}={}) {
  if(cache.has(key)) return cache.get(key);
  const data=new Uint8Array(width*height*4);
  for(let j=0;j<height;j++) for(let i=0;i<width;i++) {
    const v=pixel((i+.5)/width,(j+.5)/height),k=(j*width+i)*4;
    if(typeof v==='number') data[k]=data[k+1]=data[k+2]=Math.round(clamp01(v)*255);
    else {data[k]=Math.round(clamp01(v[0])*255);data[k+1]=Math.round(clamp01(v[1])*255);data[k+2]=Math.round(clamp01(v[2])*255);}
    data[k+3]=255;
  }
  const texture=new THREE.DataTexture(data,width,height);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;
  // Tint patterns are linear factors; baked textures are colours.
  if(baked) texture.colorSpace=THREE.SRGBColorSpace;
  texture.userData={key,baked};texture.needsUpdate=true;
  cache.set(key,texture);return texture;
}
const rgb=hex=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
const scale=(c,f)=>c.map(v=>v*f);

// Flat-sawn grain: growth rings bent by slow warping (the "cathedral" figure),
// darker latewood at the end of each ring, fibres along the length, open pores
// (oak, walnut) and ray flecks. x runs along the grain. Each wood also has the
// feature it is told apart by:
//   oak      open pores and pale ray flakes over a strong cathedral figure;
//   beech    fine, even grain with small dark ray flecks;
//   walnut   dark, wavy, with long darker streaks;
//   maple    pale and fine, with the shimmering bands of curly maple;
//   pine     bold latewood and knots, the rings swirling round them;
//   birch    the broad, cloudy figure of a rotary-cut face, with oval repair patches.
// Knots and patches are ellipses [x, y, rx, ry] on the unit tile (wrapped).
const WOOD={
  oak:{seed:11,rings:14,warp:.42,contrast:.32,pores:.36,fibre:.1,flecks:.1},
  beech:{seed:23,rings:24,warp:.16,contrast:.1,pores:.03,fibre:.06,flecks:-.2},
  walnut:{seed:37,rings:12,warp:.5,contrast:.3,pores:.22,fibre:.1,flecks:0,streaks:.16},
  maple:{seed:41,rings:22,warp:.2,contrast:.08,pores:.01,fibre:.05,flecks:.03,curl:.14},
  pine:{seed:53,rings:9,warp:.3,contrast:.46,pores:0,fibre:.05,flecks:0,knots:[[.3,.62,.045,.032],[.78,.18,.03,.022]]},
  birch:{seed:67,rings:6,warp:.62,contrast:.1,pores:.02,fibre:.08,flecks:0,patches:[[.55,.35,.09,.028],[.12,.8,.07,.024]]},
};
// Distance to an ellipse on the tile, as (d/r)², wrapping at the tile's edges.
const ellipse=(x,y,[cx,cy,rx,ry])=>{const dx=x-cx-Math.round(x-cx),dy=y-cy-Math.round(y-cy);return (dx/rx)**2+(dy/ry)**2;};
function grain(style) {
  const warp=fbm(style.seed,2,2,3),fibres=tiling(style.seed+3,6,420),pores=tiling(style.seed+5,34,300),flecks=tiling(style.seed+7,90,160),tone=tiling(style.seed+9,2,3),jitter=tiling(style.seed+17,16,48),streaks=tiling(style.seed+19,3,40);
  const knots=style.knots??[],patches=style.patches??[];
  return (x,y)=>{
    // Rings wander a little along the grain, as growth rings do, and swirl round knots.
    let swirl=0,knot=Infinity;
    for(const k of knots) {const q=ellipse(x,y,k);knot=Math.min(knot,q);swirl+=.035*Math.exp(-q/5);}
    const w=warp(x,y),t=fract((y+style.warp*(w-.5)+.012*(jitter(x,y)-.5)+swirl)*style.rings);
    const late=Math.pow(t,3)*(1-smooth(.93,1,t));
    let v=1-style.contrast*late-style.fibre*fibres(x,y)-.05*(tone(x,y)-.5);
    if(style.pores) v-=style.pores*smooth(.72,.86,pores(x,y))*(1-t*.7);
    if(style.flecks) v+=style.flecks*(smooth(.8,.9,flecks(x,y))-.2);
    if(style.streaks) v-=style.streaks*smooth(.6,.82,streaks(x,y));
    // Curl: bright and dark bands across the grain, sharper on the bright side.
    if(style.curl) {const c=Math.sin(2*Math.PI*(x*26+.35*w));v+=style.curl*(c>0?.25*c*c:-c*c);}
    // A knot: a dark core with a darker rim, where the branch grew through.
    if(knot<1.6) v*=knot<1?.42+.25*knot:1-.35*(1.6-knot)/.6;
    for(const p of patches) {const q=ellipse(x,y,p);if(q<1.08) v=q>.86?v*.78:v*1.04+.02;}
    return .06+.94*v;
  };
}
const METALS=new Set(['steel','stainless','brass','aluminium']);
export function faceTexture(material) {
  if(METALS.has(material)) return surfaceTexture('brushed');
  if(material==='white') {const speck=tiling(71,64,64);return build('face:white',64,64,(x,y)=>.97+.03*speck(x,y));}
  return build('face:'+material,128,512,grain(WOOD[material]??WOOD.oak));
}
// End grain: rings as arcs round a pith below the piece, with radial cracks of rays.
export function endTexture(material) {
  if(METALS.has(material)||material==='white') return faceTexture(material);
  const style=WOOD[material]??WOOD.oak,warp=tiling(style.seed+13,4,4),rays=tiling(style.seed+15,60,6);
  return build('end:'+material,256,256,(x,y)=>{
    const r=Math.hypot(x-.5,y+1.4)*style.rings*2+warp(x,y)*.6,t=fract(r);
    return .9-style.contrast*1.2*Math.pow(t,3)*(1-smooth(.93,1,t))-.06*smooth(.85,.95,rays(x,y))+.04*warp(x,y);
  });
}
// Odd number of plies about 1.4 mm thick, at least 3.
export const plyCount=thickness=>Math.max(3,Math.round(thickness/1.4)|1);
export function edgeTexture(material,thickness) {
  const form=MATERIALS[material]?.form,T=Math.round(thickness*2)/2;
  if(form==='plywood') {
    const n=plyCount(T),light=rgb(0xecd6a8),dark=rgb(0xd6b985),fibres=tiling(83,5,300),ends=tiling(89,180,40);
    return build('edge:plywood:'+T,256,Math.max(64,n*12),(x,y)=>{
      const k=Math.min(n-1,Math.floor(y*n)),w=fract(y*n),glue=Math.min(w,1-w)<.07?.62:1;
      // Face-grain plies (long fibres) alternate with cross plies (end-grain pores).
      const c=k%2===0?scale(light,1-.1*fibres(x,y)):scale(dark,.94-.1*smooth(.6,.8,ends(x,y)));
      return scale(c,glue);
    },{baked:true});
  }
  if(form==='board') {
    const face=rgb(MATERIALS[material].color),core=chips(97);
    return build('edge:board:'+material+':'+T,256,128,(x,y)=>{
      const skin=.6/Math.max(T,1);
      if(y<skin||y>1-skin) return face;
      // Finer, denser chips toward the faces.
      const edge=Math.min(y,1-y);return scale(core(x,y),edge<.18?1.04:.97);
    },{baked:true});
  }
  return faceTexture(material);
}
// Chipboard core: chips of wood in a pale matrix.
function chips(seed) {
  const big=tiling(seed,40,10),small=tiling(seed+1,160,40),base=rgb(0xcdb68c);
  return (x,y)=>{const v=.9+.16*smooth(.55,.75,big(x,y))-.2*smooth(.7,.85,small(x,y))+.06*(small(x,y)-.5);return scale(base,v);};
}
export function surfaceTexture(kind) {
  if(kind==='brushed') {const streak=tiling(101,3,700),fine=tiling(103,40,900);return build('brushed',128,512,(x,y)=>.84+.12*streak(x,y)+.05*fine(x,y));}
  if(kind==='mdf') {
    const speck=tiling(107,220,220),cloud=fbm(109,4,4),base=rgb(0xbd9f74);
    // Surfaced spoilboard: fine fibres and the faint bands of the fly cutter's passes.
    return build('mdf',256,256,(x,y)=>scale(base,.93+.07*cloud(x,y)-.05*smooth(.6,.8,speck(x,y))-.025*Math.pow(Math.sin(y*Math.PI*24),8)),{baked:true});
  }
  if(kind==='concrete') {
    const cloud=fbm(113,5,5,4),pits=tiling(127,260,260);
    return build('concrete',256,256,(x,y)=>{const v=.5+.14*(cloud(x,y)-.5)-.12*smooth(.82,.9,pits(x,y));return [v*.96,v*.98,v];},{baked:true});
  }
  if(kind==='chipboard') return build('chipboard',256,256,chips(131),{baked:true});
  if(kind==='plycore') {const g=grain(WOOD.birch),light=rgb(0xf0dcb0);return build('plycore',128,512,(x,y)=>scale(light,g(x,y)),{baked:true});}
  throw Error('Unknown surface '+kind);
}
// A small picture of a material's face for swatches and lists: about 200 × 100 mm
// of it, tinted by `color` (the piece colour; default the catalogue colour), as a
// data URL. Browser only ('' elsewhere); cached.
const swatches=new Map();
export function materialSwatch(material,color=MATERIALS[material]?.color??0xcccccc,{width=64,height=32}={}) {
  if(typeof document==='undefined') return '';
  const hex=typeof color==='string'?parseInt(color.replace('#',''),16):color,key=[material,hex,width,height].join(':');
  if(swatches.has(key)) return swatches.get(key);
  const texture=faceTexture(material),{width:W,height:H,data}=texture.image,tint=rgb(hex),baked=texture.userData.baked;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d'),image=context.createImageData(width,height);
  for(let j=0;j<height;j++) for(let i=0;i<width;i++) {
    const tx=Math.floor(i/width*.4*W)%W,ty=Math.floor((.3+j/height*.2)*H)%H,k=(ty*W+tx)*4,o=(j*width+i)*4;
    for(let c=0;c<3;c++) image.data[o+c]=baked?data[k+c]:Math.round(data[k+c]*tint[c]);
    image.data[o+3]=255;
  }
  context.putImageData(image,0,0);
  const url=canvas.toDataURL();swatches.set(key,url);return url;
}
// What a cut into the material shows (CNC machine): the core texture, whether it is
// baked, and the ply thickness for plywood (0 otherwise).
export function coreOf(material,thickness) {
  const form=MATERIALS[material]?.form;
  if(form==='plywood') return {texture:surfaceTexture('plycore'),baked:true,ply:thickness/plyCount(thickness)};
  if(form==='board') return {texture:surfaceTexture('chipboard'),baked:true,ply:0};
  return {texture:faceTexture(material),baked:false,ply:0};
}

// Box-projected texture coordinates for a geometry in millimetres (`unit`
// converts its own units, e.g. 1000 for metres). Each vertex takes the two axes
// across its normal's main axis; the `length` axis (the grain) maps to texture x.
export function projectUVs(geometry,{length='x',unit=1,tile=TILE}={}) {
  const p=geometry.attributes.position,n=geometry.attributes.normal??(geometry.computeVertexNormals(),geometry.attributes.normal);
  const uv=new Float32Array(p.count*2),axes=['x','y','z'];
  for(let i=0;i<p.count;i++) {
    const v={x:p.getX(i),y:p.getY(i),z:p.getZ(i)},m={x:Math.abs(n.getX(i)),y:Math.abs(n.getY(i)),z:Math.abs(n.getZ(i))};
    const main=m.x>=m.y&&m.x>=m.z?'x':m.y>=m.z?'y':'z',[a,b]=axes.filter(k=>k!==main);
    // Along the grain first; on end faces (normal along the grain) the two across axes.
    const [s,t]=main===length?[a,b]:a===length?[a,b]:[b,a];
    uv[i*2]=v[s]*unit/tile;uv[i*2+1]=v[t]*unit/tile;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return geometry;
}
// The longest axis of a box: the grain of a board or a bar.
export const grainAxis=size=>size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
