// palette.js — Kestrel Foundry's art direction in one place: a dusk-lit casting
// works. Warm sodium amber against cold teal shadow, rust and soot over
// concrete. All textures are painted on canvases at load: no image files, no
// network, everything the game shows it made itself.

import * as THREE from 'three';

export const COLORS = {
  sky: 0x1a2733,
  fog: 0x232f3a,
  ground: 0x3d3a35,
  concrete: 0x8b8578,
  concreteDark: 0x5d594f,
  rust: 0x9a5a30,
  steel: 0x707880,
  steelDark: 0x454b52,
  amber: 0xffb454,
  amberHot: 0xff8a2a,
  teal: 0x39d3c0,
  jackal: 0xd88f2e,
  warden: 0x2e8f86,
  crate: 0x8a6b42,
  containerA: 0x7a4a2c,
  containerB: 0x2f5f6e,
  containerC: 0x5d6248,
};

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grain(ctx, w, h, base, fleck, n, alpha) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = fleck;
    ctx.globalAlpha = Math.random() * alpha;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

export function concreteTexture() {
  return canvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, '#8b8578', '#5d594f', 2600, 0.25);
    grain(ctx, w, h, '#8b8578', '#a49d8d', 1500, 0.18);
    ctx.strokeStyle = 'rgba(40,38,34,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = 'rgba(50,46,40,.20)';
    ctx.fillRect(0, h - 26, w, 26); // soot line at the foot of the wall
  });
}

export function groundTexture() {
  return canvas(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, '#3d3a35', '#24221e', 3200, 0.3);
    grain(ctx, w, h, '#3d3a35', '#57534a', 1400, 0.2);
    ctx.strokeStyle = 'rgba(20,19,17,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, h); ctx.stroke();
  });
}

export function crateTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    grain(ctx, w, h, '#8a6b42', '#5f4726', 700, 0.25);
    ctx.strokeStyle = '#5f4726'; ctx.lineWidth = 7;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(w - 4, h - 4);
    ctx.moveTo(w - 4, 4); ctx.lineTo(4, h - 4); ctx.stroke();
  });
}

export function metalTexture() {
  return canvas(128, 256, (ctx, w, h) => {
    grain(ctx, w, h, '#707880', '#454b52', 1200, 0.22);
    ctx.fillStyle = 'rgba(30,32,36,.35)';
    for (let x = 8; x < w; x += 24) ctx.fillRect(x, 0, 3, h); // corrugation
    ctx.fillStyle = 'rgba(154,90,48,.4)';
    ctx.fillRect(0, h - 30, w, 30); // rust creeping up
  });
}

export function hazardTexture() {
  return canvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9a227'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1c1c1c';
    for (let i = -2; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, h); ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 16, h);
      ctx.fill();
    }
  });
}

// A painted site marker for the ground: a ring, a letter, worn paint.
export function siteTexture(letter, color) {
  const t = canvas(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.85; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 104, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '800 150px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + 8);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#3d3a35';
    for (let i = 0; i < 260; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    ctx.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function materials() {
  const concrete = concreteTexture(); concrete.repeat.set(2, 1);
  const ground = groundTexture(); ground.repeat.set(24, 24);
  const crate = crateTexture();
  const metal = metalTexture();
  const hazard = hazardTexture(); hazard.repeat.set(3, 1);
  return {
    ground: new THREE.MeshStandardMaterial({ map: ground, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: COLORS.concreteDark, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ map: metal, roughness: 0.6, metalness: 0.55 }),
    steelDark: new THREE.MeshStandardMaterial({ color: COLORS.steelDark, roughness: 0.55, metalness: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ color: COLORS.rust, roughness: 0.85, metalness: 0.2 }),
    crate: new THREE.MeshStandardMaterial({ map: crate, roughness: 0.9 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.8 }),
    containerA: new THREE.MeshStandardMaterial({ map: metal, color: 0xd88a50, roughness: 0.7, metalness: 0.4 }),
    containerB: new THREE.MeshStandardMaterial({ map: metal, color: 0x5fa8bc, roughness: 0.7, metalness: 0.4 }),
    containerC: new THREE.MeshStandardMaterial({ map: metal, color: 0x9aa578, roughness: 0.7, metalness: 0.4 }),
    furnace: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.8, metalness: 0.4 }),
    furnaceGlow: new THREE.MeshStandardMaterial({ color: 0x2a1503, emissive: 0xff7a1e, emissiveIntensity: 2.6 }),
    lampLight: new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb454, emissiveIntensity: 3.2 }),
    chargeBody: new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.5, metalness: 0.6 }),
    chargeLight: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3b26, emissiveIntensity: 2.4 }),
  };
}
