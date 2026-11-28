export function nativeRenderEvidence(log,{offscreen=false,backend='xvfb'}={}) {
 if(typeof log!=='string'||log.length>1048576)throw Error('Invalid native render log');
 const pixels=[...log.matchAll(/Visible OBJ pixels: (\d+)/g)].map(m=>Number(m[1])),frames=[...log.matchAll(/OpenGL wildfire replay smoke test rendered (\d+) frame\(s\)/g)].map(m=>Number(m[1]));
 if(!pixels.length||pixels.some(n=>!Number.isSafeInteger(n)||n<=0)||frames.length!==1||!Number.isSafeInteger(frames[0])||frames[0]<1)throw Error('Native smoke run did not prove visible OBJ rendering');
 const targets=[...log.matchAll(/^OFFSCREEN_JSON=(.+)$/gm)].map(m=>JSON.parse(m[1]));
 if(offscreen&&!/Offscreen composed: \d+x\d+ -> \d+x\d+/.test(log))throw Error('Offscreen smoke run did not prove the final blit');
 if(offscreen&&(!targets.length||targets.some(t=>t.fallback!==false||t.resize_failures!==0||!(t.width>0&&t.height>0))))throw Error('Offscreen smoke run fell back or did not establish a valid target');
 if(/TerraFlux viewer error:|smoke test found no visible|Offscreen resize failed:/i.test(log))throw Error('Native renderer reported a failure');
 const importedTriangles=Number(log.match(/Imported scene: (\d+) triangles/)?.[1]);if(!Number.isSafeInteger(importedTriangles)||importedTriangles<1)throw Error('Native smoke log lacks an imported scene');
 const renderer=log.match(/^OSMESA_CONTEXT_RENDERER=(.+)$/m)?.[1]??null,version=log.match(/^OSMESA_CONTEXT_VERSION=(.+)$/m)?.[1]??null;
 if(backend==='osmesa'){const v=version?.match(/^(\d+)\.(\d+)/);if(!renderer||!v||Number(v[1])<4||Number(v[1])===4&&Number(v[2])<3)throw Error('OSMesa did not establish a real OpenGL 4.3+ context');}
 return {importedTriangles,renderer,version,mode:offscreen?'offscreen':'direct',frames:frames[0],visibleObjPixels:Math.min(...pixels),offscreenTargets:targets};
}
