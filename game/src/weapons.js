// weapons.js — the Jackal/Warden armoury. Four guns, one idea: a steady hand
// beats a fast one. Spread blooms hard while moving or spraying and settles
// when you stop and tap, so the first placed shot is worth three sprayed.

import * as THREE from 'three';

// damage is per bullet at point blank; falloff applies past `range`.
// spread is in radians: base (settled) / max (fully bloomed).
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 SIDEARM', price: 0, kind: 'pistol',
    damage: 26, headMult: 3.2, rpm: 340, auto: false,
    mag: 12, reserve: 48, reloadMs: 1100,
    spreadBase: 0.006, spreadMax: 0.045, bloomPerShot: 0.010, settlePerSec: 0.06,
    range: 34, falloff: 0.55, pellets: 1, zoom: 1.0,
  },
  rook: {
    id: 'rook', name: 'ROOK SMG', price: 1500, kind: 'smg',
    damage: 19, headMult: 2.6, rpm: 780, auto: true,
    mag: 30, reserve: 90, reloadMs: 1500,
    spreadBase: 0.011, spreadMax: 0.075, bloomPerShot: 0.009, settlePerSec: 0.085,
    range: 26, falloff: 0.5, pellets: 1, zoom: 1.0,
  },
  kestrel: {
    id: 'kestrel', name: 'KESTREL AR', price: 2700, kind: 'rifle',
    damage: 33, headMult: 3.4, rpm: 600, auto: true,
    mag: 25, reserve: 75, reloadMs: 1900,
    spreadBase: 0.004, spreadMax: 0.06, bloomPerShot: 0.011, settlePerSec: 0.075,
    range: 60, falloff: 0.7, pellets: 1, zoom: 1.08,
  },
  longbow: {
    id: 'longbow', name: 'LONGBOW DMR', price: 3200, kind: 'sniper',
    damage: 92, headMult: 2.2, rpm: 68, auto: false,
    mag: 5, reserve: 25, reloadMs: 2400,
    spreadBase: 0.0008, spreadMax: 0.05, bloomPerShot: 0.05, settlePerSec: 0.09,
    range: 120, falloff: 0.9, pellets: 1, zoom: 2.4,
  },
};

export const BUY_MENU = [
  { key: 'Digit2', slot: 'primary', weapon: 'rook', label: 'Rook SMG', desc: 'Fast, close-range. Forgiving up close, weak at range.' },
  { key: 'Digit3', slot: 'primary', weapon: 'kestrel', label: 'Kestrel AR', desc: 'The all-round rifle. Rewards short, placed bursts.' },
  { key: 'Digit4', slot: 'primary', weapon: 'longbow', label: 'Longbow DMR', desc: 'One heavy bolt at a time. Deadly down the lanes.' },
  { key: 'Digit5', slot: 'armor', weapon: null, label: 'Kevlar Vest', desc: 'Soaks 55% of bullet damage while it lasts.', price: 650 },
];

// A low-poly viewmodel built from boxes: receiver, barrel, grip, sight.
// Team-tinted tape on the grip so your own gun reads as yours.
export function buildViewmodel(weaponId, teamColor) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.45, metalness: 0.65 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.55 });
  const tape = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8 });
  const add = (w, h, d, x, y, z, mat = dark) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m); return m;
  };
  if (weaponId === 'p9') {
    add(0.055, 0.09, 0.24, 0, 0, -0.1, mid);
    add(0.05, 0.11, 0.07, 0, -0.09, 0.02, tape);
    add(0.02, 0.03, 0.02, 0, 0.06, -0.2, dark);
  } else if (weaponId === 'rook') {
    add(0.06, 0.1, 0.42, 0, 0, -0.16, mid);
    add(0.05, 0.16, 0.06, 0, -0.11, -0.05, dark);
    add(0.05, 0.1, 0.06, 0, -0.08, 0.08, tape);
    add(0.045, 0.05, 0.2, 0, 0.02, -0.42, dark);
  } else if (weaponId === 'longbow') {
    add(0.055, 0.09, 0.6, 0, 0, -0.3, mid);
    add(0.03, 0.03, 0.5, 0, 0.01, -0.72, dark);
    add(0.06, 0.07, 0.14, 0, 0.09, -0.2, dark); // scope block
    add(0.05, 0.12, 0.06, 0, -0.09, 0.02, tape);
    add(0.05, 0.08, 0.16, 0, -0.03, 0.24, dark); // stock
  } else { // kestrel
    add(0.06, 0.1, 0.52, 0, 0, -0.22, mid);
    add(0.05, 0.15, 0.055, 0, -0.11, -0.08, dark);
    add(0.05, 0.1, 0.06, 0, -0.08, 0.1, tape);
    add(0.04, 0.04, 0.24, 0, 0.03, -0.52, dark);
    add(0.015, 0.05, 0.015, 0, 0.09, -0.44, dark); // front post
    add(0.05, 0.04, 0.05, 0, 0.08, 0.02, dark);    // rear sight
  }
  // hands: two simple blocks low on the frame
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98a64, roughness: 0.85 });
  const gloveL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.09), skin);
  gloveL.position.set(0.02, -0.09, -0.34);
  const gloveR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.09), skin);
  gloveR.position.set(0.03, -0.1, 0.05);
  g.add(gloveL, gloveR);
  g.position.set(0.24, -0.22, -0.45);
  return g;
}

// Muzzle flash: a small additive star that lives for two frames.
export function buildMuzzleFlash() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), mat);
  spike.rotation.x = -Math.PI / 2; spike.position.z = -0.12;
  g.add(core, spike);
  g.visible = false;
  return g;
}
