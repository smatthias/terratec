// Light and shadow for the studio's 3D views (the room, the furniture designer,
// the workshop benches): a warm key light that casts soft shadows, a cool fill
// light from the other side and a weaker sky/ground ambient, so pieces show
// their form (lit and shaded sides, shadows on each other and on the ground)
// instead of the flat look of strong ambient light.
//
// Shadows need a graphics card: with a software renderer (SwiftShader, llvmpipe:
// virtual machines, remote desktops, CI) the views are lit the same way without them.
import * as THREE from 'three';

export function softwareRenderer(renderer) {
  const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
  return /swiftshader|llvmpipe|softpipe|software/i.test(info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'');
}
const KEY=new THREE.Vector3(.5,1,.7).normalize(),FILL=new THREE.Vector3(-.8,.35,-.4).normalize();

// `ground`: the ambient's ground colour; `catcher`: a transparent floor that only
// shows shadows (for views without a floor of their own). Returns {shadows,
// fit(box, floorY?), setShadows(on)}; fit aims the lights and the shadow camera
// at a box {min, max} in scene units (mm in the designer, m in the room).
export function studioLights(scene,renderer,{ground=0x3a4a44,catcher=false}={}) {
  const shadows=!softwareRenderer(renderer);
  renderer.shadowMap.enabled=shadows;renderer.shadowMap.type=THREE.PCFShadowMap;
  const hemi=new THREE.HemisphereLight(0xffffff,ground,1.5);
  const key=new THREE.DirectionalLight(0xfff1dc,2.8),fill=new THREE.DirectionalLight(0xdde8ff,.9);
  key.castShadow=shadows;key.shadow.mapSize.set(2048,2048);
  scene.add(hemi,key,key.target,fill,fill.target);
  let floor=null;
  if(catcher&&shadows) {
    floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.32}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.userData.role='shadow';scene.add(floor);
  }
  return {
    shadows,
    fit(box,floorY=box.min.y) {
      const centre=new THREE.Vector3().addVectors(box.min,box.max).multiplyScalar(.5);
      const R=Math.max(box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z,1e-3)*.75+1e-3;
      key.target.position.copy(centre);fill.target.position.copy(centre);
      key.position.copy(centre).addScaledVector(KEY,R*4);fill.position.copy(centre).addScaledVector(FILL,R*4);
      const cam=key.shadow.camera;cam.left=cam.bottom=-R*1.3;cam.right=cam.top=R*1.3;cam.near=R;cam.far=R*8;cam.updateProjectionMatrix();
      // Biases in proportion to the scene, so millimetres and metres behave alike.
      key.shadow.bias=-.0005;key.shadow.normalBias=R*.003;
      if(floor) {floor.position.set(centre.x,floorY-R*.002,centre.z);floor.scale.set(R*6,R*6,1);}
    },
    setShadows(on) {key.castShadow=shadows&&on;if(floor) floor.visible=shadows&&on;},
  };
}
