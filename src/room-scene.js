import * as THREE from 'three';

export const surfaces = [
  { id: 'floor', label: 'Floor' },
  { id: 'north', label: 'North wall' },
  { id: 'west', label: 'West wall' },
  { id: 'south', label: 'South wall' },
  { id: 'east', label: 'East wall' }
];

export function createRoom({ width: w, depth: d, height: h }) {
  const group = new THREE.Group();
  const box = (id, size, position, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .85 }));
    mesh.position.set(...position);
    mesh.userData = { id, baseColor: color };
    mesh.name = surfaces.find(surface => surface.id === id).label;
    group.add(mesh);
  };
  box('floor', [w,.08,d], [0,-.04,0], 0x9eb8ac);
  box('north', [w+.32,h,.16], [0,h/2,-d/2-.08], 0xddd6c8);
  box('west', [.16,h,d], [-w/2-.08,h/2,0], 0xc4cabb);
  box('south', [w+.32,h,.16], [0,h/2,d/2+.08], 0xddd6c8);
  box('east', [.16,h,d], [w/2+.08,h/2,0], 0xc4cabb);
  return group;
}

export function updateSurfaces(group, view, selected) {
  for (const mesh of group.children) {
    mesh.visible = view === 'Plan' || !['south','east'].includes(mesh.userData.id);
    mesh.material.color.setHex(mesh.userData.baseColor);
    mesh.material.emissive.setHex(mesh.userData.id === selected ? 0x766228 : 0x000000);
    mesh.material.emissiveIntensity = .65;
  }
}

export function fitCamera(camera, room, aspect, view) {
  const w = room.width + .32, d = room.depth + .32;
  if (view === 'Plan') {
    const halfHeight = Math.max(d/2, w/(2*aspect)) * 1.3;
    camera.left = -halfHeight*aspect; camera.right = halfHeight*aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.zoom = 1;
    camera.up.set(0,0,-1);
    camera.position.set(0,room.height+10,0);
    camera.near = .01; camera.far = room.height+100;
  } else {
    camera.aspect = aspect;
    const extent = Math.max(w,d,room.height);
    // Account for narrow portrait viewports as well as tall rooms.
    const distance = extent*1.8 / Math.min(1,aspect);
    camera.up.set(0,1,0);
    camera.position.set(distance,distance*.8,distance);
    camera.near = .01; camera.far = Math.max(2000,distance*10);
  }
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

export function pickSurface(group, camera, x, y) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x,y), camera);
  group.updateMatrixWorld(true);
  return ray.intersectObjects(group.children.filter(mesh => mesh.visible), false)[0]?.object.userData.id ?? null;
}
