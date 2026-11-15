// world.js — the Kestrel Foundry: a derelict casting works at dusk.
// One data table of boxes becomes both the visible map and the collision
// world, so what you see is exactly what you bump into. Two plant sites —
// the Furnace Hall (A) in the north-west and the Depot (B) in the north-east —
// are joined to the southern Jackal yard by a mid plaza and two side lanes.
//
// Layout (metres, x east, z south; Wardens defend the north, Jackals attack
// from the south):
//        A hall        north yard        B depot
//   west lane     mid plaza doors     east lane
//        loading dock + Jackal yard (spawn)

import * as THREE from 'three';
import { COLORS, materials, siteTexture } from './palette.js';

// x, z = centre; w, d = footprint; h = height; mat = key into materials()
const BOXES = [
  // perimeter
  { x: 0, z: -45, w: 92, d: 2, h: 7, mat: 'concreteDark' },
  { x: 0, z: 45, w: 92, d: 2, h: 7, mat: 'concreteDark' },
  { x: -45, z: 0, w: 2, d: 92, h: 7, mat: 'concreteDark' },
  { x: 45, z: 0, w: 2, d: 92, h: 7, mat: 'concreteDark' },
  // Furnace Hall (A): north and west walls, south wall with a door, east wall with a door
  { x: -26, z: -40.5, w: 29, d: 1.4, h: 5.5, mat: 'concrete' },
  { x: -40.5, z: -27, w: 1.4, d: 28, h: 5.5, mat: 'concrete' },
  { x: -35, z: -13.5, w: 10, d: 1.4, h: 5.5, mat: 'concrete' },
  { x: -17, z: -13.5, w: 10, d: 1.4, h: 5.5, mat: 'concrete' },
  { x: -11.5, z: -35, w: 1.4, d: 10, h: 5.5, mat: 'concrete' },
  { x: -11.5, z: -18, w: 1.4, d: 8, h: 5.5, mat: 'concrete' },
  // Depot (B): north and east walls, a west fence with a gap; the south side is open
  { x: 26, z: -40.5, w: 29, d: 1.4, h: 5.5, mat: 'concrete' },
  { x: 40.5, z: -27, w: 1.4, d: 28, h: 5.5, mat: 'concrete' },
  { x: 11.5, z: -36, w: 1.4, d: 9, h: 5.5, mat: 'concrete' },
  { x: 11.5, z: -18, w: 1.4, d: 11, h: 5.5, mat: 'concrete' },
  // the works wall between mid and the north yard, with a centre door
  { x: -8, z: -13.5, w: 7, d: 1.4, h: 5, mat: 'concrete' },
  { x: 8, z: -13.5, w: 7, d: 1.4, h: 5, mat: 'concrete' },
  // side warehouses that form the two lanes
  { x: -24, z: 9, w: 13, d: 15, h: 6, mat: 'steel' },
  { x: 24, z: 9, w: 13, d: 15, h: 6, mat: 'steel' },
  // loading dock across the Jackal yard (low: cover, not a wall)
  { x: -19, z: 20, w: 22, d: 2, h: 1.1, mat: 'concreteDark' },
  { x: 19, z: 20, w: 22, d: 2, h: 1.1, mat: 'concreteDark' },
  // mid plaza machine block
  { x: 0, z: -2, w: 9, d: 6, h: 3.4, mat: 'steelDark' },
];

// loose cover: crates, barrels and containers, also solid
const PROPS = [
  { kind: 'crate', x: -6, z: 8 }, { kind: 'crate', x: 6, z: 8 },
  { kind: 'crate', x: -6, z: -10 }, { kind: 'crate', x: 6, z: -10 },
  { kind: 'crateStack', x: -14, z: 26 }, { kind: 'crate', x: 14, z: 26 },
  { kind: 'crate', x: 0, z: 30 }, { kind: 'crateStack', x: -26, z: 33 },
  { kind: 'crate', x: 26, z: 33 }, { kind: 'barrel', x: -33.8, z: 2 },
  { kind: 'barrel', x: 33.8, z: 2 }, { kind: 'barrel', x: -20, z: -22 },
  { kind: 'crate', x: -34, z: -20 }, { kind: 'crateStack', x: -18, z: -34 },
  { kind: 'crate', x: -33, z: -33 }, { kind: 'barrel', x: 20, z: -36 },
  { kind: 'containerA', x: 21, z: -33 }, { kind: 'containerB', x: 31, z: -19 },
  { kind: 'containerC', x: 18, z: -19 }, { kind: 'containerA', x: 33, z: -34 },
  { kind: 'crate', x: 26, z: -12 }, { kind: 'barrel', x: -8, z: 16 },
  { kind: 'barrel', x: 8, z: 16 }, { kind: 'crate', x: -38, z: -8 },
  { kind: 'crate', x: 38, z: -8 },
];

export const SITES = {
  A: { x: -26, z: -27, r: 8.5, name: 'the Furnace' },
  B: { x: 26, z: -27, r: 8.5, name: 'the Depot' },
};

export const SPAWNS = {
  jackal: [[-4, 37], [-2, 38.5], [0, 37], [2, 38.5], [4, 37]],
  warden: [[-4, -37], [-2, -38.5], [0, -37], [2, -38.5], [4, -37]],
};

// waypoint graph: bots walk these nodes; links are hand-set so routes are sane
const NODES = [
  [0, 33], [-14, 29], [14, 29], [-27, 31], [27, 31],           // 0-4  Jackal yard
  [-36, 18], [36, 18], [-36, -4], [36, -4],                    // 5-8  lanes
  [0, 24], [0, 12], [0, -7], [0, -20],                         // 9-12 mid spine
  [-26, -8], [26, -8],                                         // 13-14 site approaches
  [-26, -19], [-26, -21], [-38, -31], [-17, -33],              // 15-18 inside A (16 = south of the furnace)
  [26, -19], [26, -27], [36, -28], [16, -31],                  // 19-22 inside B
  [-11, -26], [11, -28],                                       // 23-24 A east door, B west gap
  [-5, -33], [5, -33], [0, -27],                               // 25-27 Warden yard
  [-15, 12], [15, 12],                                         // 28-29 warehouse fronts
  [-31, -31.5], [-7, -1], [7, -1],                             // 30 A north-west link, 31-32 mid flanks
];
const LINKS = [
  [0, 1], [0, 2], [0, 9], [1, 3], [2, 4], [1, 9], [2, 9],
  [3, 5], [4, 6], [5, 7], [6, 8], [7, 13], [8, 14],
  [28, 5], [29, 6], [28, 10], [29, 10], [9, 10], [10, 31],
  [10, 32], [31, 11], [32, 11], [11, 12], [12, 27], [27, 25],
  [27, 26], [25, 23], [26, 24], [23, 15], [24, 19], [13, 15],
  [14, 19], [15, 16], [19, 20], [20, 21], [20, 22], [21, 22],
  [13, 11], [14, 11], [18, 23], [18, 30], [30, 17],
];

export function buildWorld(scene) {
  const mats = materials();
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const boxGeoCache = new Map();
  function box(x, z, w, d, h, mat, yBase = 0) {
    const key = `${w}x${d}x${h}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(boxGeoCache.get(key), mat);
    m.position.set(x, yBase + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (h >= 0.9) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
    return m;
  }

  for (const b of BOXES) box(b.x, b.z, b.w, b.d, b.h, mats[b.mat]);

  for (const p of PROPS) {
    if (p.kind === 'crate') box(p.x, p.z, 1.6, 1.6, 1.6, mats.crate);
    else if (p.kind === 'crateStack') { box(p.x, p.z, 1.6, 1.6, 1.6, mats.crate); box(p.x, p.z, 1.6, 1.6, 1.6, mats.crate, 1.6); }
    else if (p.kind === 'barrel') {
      const g = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12);
      const m = new THREE.Mesh(g, mats.rust);
      m.position.set(p.x, 0.65, p.z); m.castShadow = true;
      group.add(m);
      colliders.push({ minX: p.x - 0.55, maxX: p.x + 0.55, minZ: p.z - 0.55, maxZ: p.z + 0.55, h: 1.3 });
    } else { // shipping containers: 6 long, 2.6 wide, 2.6 high
      const mat = mats[p.kind];
      box(p.x, p.z, 6, 2.6, 2.6, mat);
    }
  }

  // the furnace itself: a squat cylinder with a glowing mouth and a chimney
  const furnace = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.5, 6.4, 18), mats.furnace);
  body.position.y = 3.2; body.castShadow = true;
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 18), mats.furnaceGlow);
  mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 1.6, 3.2);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 5, 10), mats.steelDark);
  chimney.position.y = 8.6;
  furnace.add(body, mouth, chimney);
  furnace.position.set(SITES.A.x, 0, SITES.A.z);
  group.add(furnace);
  colliders.push({ minX: SITES.A.x - 3.4, maxX: SITES.A.x + 3.4, minZ: SITES.A.z - 3.4, maxZ: SITES.A.z + 3.4, h: 6 });
  const furnaceLight = new THREE.PointLight(0xff7a1e, 60, 24, 1.8);
  furnaceLight.position.set(SITES.A.x, 2, SITES.A.z + 4.5);
  group.add(furnaceLight);

  // hazard trim around both sites, and the painted ground markers
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(15, 15),
      new THREE.MeshBasicMaterial({ map: siteTexture(key, key === 'A' ? '#ffb454' : '#39d3c0'), transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 0.4), mats.hazard);
    trim.position.set(site.x, 0.25, site.z + site.r - 0.4);
    group.add(trim);
  }

  // lamp posts: emissive heads and real light where it matters
  const lampAt = (x, z, withLight) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mats.steelDark);
    pole.position.set(x, 2.7, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), mats.lampLight);
    head.position.set(x, 5.45, z);
    group.add(pole, head);
    if (withLight) {
      const l = new THREE.PointLight(0xffb454, 50, 30, 1.9);
      l.position.set(x, 5.2, z);
      group.add(l);
    }
  };
  lampAt(0, 12, true); lampAt(-26, -16, true); lampAt(26, -16, true);
  lampAt(0, 33, false); lampAt(0, -33, false); lampAt(-36, 6, false); lampAt(36, 6, false);

  // two gantry cranes for skyline depth
  for (const gx of [-8, 30]) {
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.8), mats.steelDark);
    legL.position.set(gx - 9, 5.5, -44 + 3);
    const legR = legL.clone(); legR.position.x = gx + 9;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 1.1), mats.rust);
    beam.position.set(gx, 11, -44 + 3);
    group.add(legL, legR, beam);
  }

  // light rig: low sun through the haze, cool fill from the sky
  const sun = new THREE.DirectionalLight(0xffc98a, 2.6);
  sun.position.set(-38, 42, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fb4c9, 0x2e2620, 0.85));

  const waypoints = NODES.map(([x, z], i) => ({ i, x, z, links: [] }));
  for (const [a, b] of LINKS) { waypoints[a].links.push(b); waypoints[b].links.push(a); }

  return {
    group, colliders, waypoints,
    update(t) { mats.furnaceGlow.emissiveIntensity = 2.3 + Math.sin(t * 7.3) * 0.35 + Math.sin(t * 17.7) * 0.15; },
  };
}

// Resolve a circle (x, z, radius r) out of every solid AABB. Movement code
// calls this after integrating a step; two passes settle corners.
export function collide(pos, r, colliders) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.h < 0.9) continue;
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest exit
        const exits = [
          { d: pos.x - c.minX, x: c.minX - r, z: pos.z },
          { d: c.maxX - pos.x, x: c.maxX + r, z: pos.z },
          { d: pos.z - c.minZ, x: pos.x, z: c.minZ - r },
          { d: c.maxZ - pos.z, x: pos.x, z: c.maxZ + r },
        ].sort((a, b) => a.d - b.d);
        pos.x = exits[0].x; pos.z = exits[0].z;
      }
    }
  }
  pos.x = Math.max(-43.4, Math.min(43.4, pos.x));
  pos.z = Math.max(-43.4, Math.min(43.4, pos.z));
}

// Is the straight line a->b free of tall cover? Used for bot line of sight.
export function lineClear(ax, az, bx, bz, colliders) {
  for (const c of colliders) {
    if (c.h < 1.7) continue; // low cover does not block sight at head height
    // segment vs AABB (slab test)
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < c.minX || ax > c.maxX) continue; }
    else {
      let ta = (c.minX - ax) / dx, tb = (c.maxX - ax) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (az < c.minZ || az > c.maxZ) continue; }
    else {
      let ta = (c.minZ - az) / dz, tb = (c.maxZ - az) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return false;
  }
  return true;
}

// Breadth-first path over the waypoint graph; returns the node list a->b.
export function findPath(waypoints, fromIdx, toIdx) {
  if (fromIdx === toIdx) return [toIdx];
  const prev = new Map([[fromIdx, -1]]);
  const queue = [fromIdx];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of waypoints[cur].links) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === toIdx) {
        const path = [toIdx];
        let p = cur;
        while (p !== -1) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      queue.push(nb);
    }
  }
  return [toIdx];
}

export function nearestNode(waypoints, x, z) {
  let best = 0, bd = Infinity;
  for (const w of waypoints) {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bd) { bd = d; best = w.i; }
  }
  return best;
}
