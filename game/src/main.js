// main.js — Kestrel Foundry's match brain. It owns the round state machine
// (buy -> live -> planted -> over), the economy, the Charge objective, all
// shooting resolution, and the staging hooks the screenshots are taken with
// (?shot=start|play|end). The other modules are specialists: world builds
// the map, bots walk and fight, player moves the camera's body, hud draws
// the DOM, weapons tabulate the guns, audio synthesizes the noise.

import * as THREE from 'three';
import { buildWorld, SITES, SPAWNS } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Input } from './input.js';
import { Hud, fmtClock } from './hud.js';
import { Sfx } from './audio.js';
import { WEAPONS, BUY_MENU, buildViewmodel, buildMuzzleFlash } from './weapons.js';
import { COLORS } from './palette.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // null in a real game

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 55, 130);

const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 300);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const world = buildWorld(scene);
const input = new Input(renderer.domElement);
const hud = new Hud();
const sfx = new Sfx();
if (SHOT) input.disabled = true;

// ---------------------------------------------------------------- cast
const player = new Player(world.colliders);
const me = {
  isPlayer: true, team: 'jackal', name: 'You', pos: player.pos,
  hp: 100, armor: 0, alive: true, money: 800, kills: 0, deaths: 0,
  weaponId: 'p9', hasCharge: false,
};
const bots = [];
for (let i = 1; i < 5; i++) bots.push(new Bot('jackal', i, scene));
for (let i = 0; i < 5; i++) bots.push(new Bot('warden', i, scene));
const all = [me, ...bots];
const foesOf = (c) => all.filter((o) => o.team !== c.team);
const alliesOf = (c) => all.filter((o) => o.team === c.team && o !== c);

// player weapon state: owned guns with their own magazines
const myGuns = { p9: { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve } };
let myPrimary = null; // weapon id in the primary slot, if bought

// ---------------------------------------------------------------- match state
const MATCH = {
  phase: 'title', // title | buy | live | over | matchover
  round: 0,
  score: { jackal: 0, warden: 0 },
  phaseEndsAt: 0,
  roundEndsAt: 0,
  plantedAtSite: null,
  plantEndsAt: 0,
  winner: null,
  winReason: '',
  targetScore: 6,
};
let now = 0; // seconds, match clock

const charge = {
  state: 'carried', // carried | dropped | planted
  carrier: me,
  site: null,
  pos: new THREE.Vector3(),
  mesh: null,
  channel: null, // {actor, kind, endsAt, total}
};
{
  const g = new THREE.Group();
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.5, metalness: 0.6 }));
  const lampM = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3b26, emissiveIntensity: 2.4 }));
  lampM.position.y = 0.14;
  g.add(bodyM, lampM);
  g.visible = false;
  charge.mesh = g;
  scene.add(g);
}

// tracers and impact sparks: tiny pooled effects
const tracers = [];
function tracer(from, to, color = 0xffd98a) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, until: now + 0.06 });
}
const sparks = [];
const sparkGeo = new THREE.TetrahedronGeometry(0.035);
function burst(pos, n = 6, color = 0xffc46e) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4);
    scene.add(m);
    sparks.push({ m, until: now + 0.32 });
  }
}

// dropped rifles (a fallen fighter's primary can be picked up)
const droppedGuns = [];
function dropGun(weaponId, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.66),
    new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.5, metalness: 0.5 }));
  m.position.set(pos.x, 0.12, pos.z);
  m.rotation.y = Math.random() * 3;
  scene.add(m);
  droppedGuns.push({ weaponId, pos: m.position, mesh: m });
}

// ---------------------------------------------------------------- viewmodel
let viewmodel = null, muzzle = null, recoil = 0, adsAmt = 0;
function setViewmodel() {
  if (viewmodel) { camera.remove(viewmodel); }
  viewmodel = buildViewmodel(me.weaponId, COLORS.jackal);
  muzzle = buildMuzzleFlash();
  muzzle.position.set(0, 0.03, me.weaponId === 'longbow' ? -1.0 : -0.62);
  viewmodel.add(muzzle);
  camera.add(viewmodel);
  scene.add(camera);
}
setViewmodel();

// ---------------------------------------------------------------- combat
const raycaster = new THREE.Raycaster();
raycaster.far = 160;
const hitMeshes = [];
for (const b of bots) hitMeshes.push(b.headMesh, ...b.bodyMeshes);

function eyeOf(c) { return c.isPlayer ? player.eye() : c.eye(); }
function chestOf(c) { return c.isPlayer ? new THREE.Vector3(c.pos.x, 1.25, c.pos.z) : c.chestPos(); }

function damage(target, amount, attacker, part) {
  if (!target.alive || MATCH.phase === 'over' || MATCH.phase === 'matchover') return;
  let eff = amount;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, amount * 0.55);
    target.armor -= absorbed;
    eff = amount - absorbed;
  }
  target.hp -= eff;
  if (target.isPlayer) { hud.damageFlash(); sfx.hurt(); }
  if (target.hp <= 0) kill(target, attacker, part);
}

function kill(victim, attacker, part) {
  victim.hp = 0;
  victim.alive = false;
  victim.deaths++;
  if (attacker && attacker !== victim) {
    attacker.kills++;
    attacker.money += 300;
  }
  const wname = attacker ? WEAPONS[attacker.weaponId].name.split(' ')[0] : '—';
  const us = (c) => c.team === 'jackal';
  hud.feed(`<b class="${us(attacker || victim) ? 'us' : 'them'}">${attacker ? attacker.name : '?'}</b><span class="wpn">${wname}${part === 'head' ? ' ⌖' : ''}</span><b class="${us(victim) ? 'us' : 'them'}">${victim.name}</b>`);
  if (victim.isPlayer) { sfx.hurt(); }
  else if (attacker && attacker.isPlayer) { hud.hitmark(true); sfx.kill(); }
  // the Charge and a primary weapon fall where the fighter fell
  if (charge.carrier === victim && charge.state === 'carried') {
    charge.state = 'dropped';
    charge.carrier = null;
    charge.pos.set(victim.pos.x, 0, victim.pos.z);
    charge.mesh.visible = true;
    charge.mesh.position.set(victim.pos.x, 0.14, victim.pos.z);
    hud.objective(victim.team === 'jackal' ? 'The Charge is down — recover it' : 'The Charge is down');
  }
  if (!victim.isPlayer && victim.weaponId !== 'p9') dropGun(victim.weaponId, victim.pos);
  if (victim.isPlayer && myPrimary) { const mp = myPrimary; dropGun(mp, victim.pos); delete myGuns[mp]; myPrimary = null; me.weaponId = 'p9'; }
  checkElimination();
}

function checkElimination() {
  if (MATCH.phase !== 'live') return;
  const j = all.filter((c) => c.team === 'jackal' && c.alive).length;
  const w = all.filter((c) => c.team === 'warden' && c.alive).length;
  if (j === 0) endRound('warden', 'Jackals eliminated');
  else if (w === 0) endRound('jackal', 'Wardens eliminated');
}

// the player's own trigger: real raycasts against bot hitboxes and the world
let lastShotAt = -9, bloom = 0, triggerHeld = false, reloadingUntil = 0;
function playerShoot() {
  const w = WEAPONS[me.weaponId];
  const gun = myGuns[me.weaponId];
  if (now < reloadingUntil) return;
  if (gun.mag <= 0) { sfx.dryFire(); lastShotAt = now; startReload(); return; }
  gun.mag--;
  lastShotAt = now;
  bloom = Math.min(w.spreadMax, bloom + w.bloomPerShot);
  recoil = Math.min(1, recoil + (w.kind === 'sniper' ? 1 : 0.45));
  sfx.shot(w.kind);
  muzzle.visible = true;
  setTimeout(() => { muzzle.visible = false; }, 45);

  const movePenalty = (player.speed2d / 4.7) * 0.02 + (player.onGround ? 0 : 0.03);
  const spread = w.spreadBase + bloom + movePenalty;
  const origin = player.eye();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  dir.normalize();
  raycaster.set(origin, dir);
  const botHits = raycaster.intersectObjects(hitMeshes.filter((m) => m.userData.bot.alive), false);
  const worldHits = raycaster.intersectObject(world.group, true).filter((h) => h.object.isMesh && !h.object.isSprite);
  const bh = botHits[0], wh = worldHits[0];
  const muzzleWorld = origin.clone().add(dir.clone().multiplyScalar(0.7)).add(new THREE.Vector3(0, -0.08, 0));
  if (bh && (!wh || bh.distance < wh.distance)) {
    const bot = bh.object.userData.bot;
    const part = bh.object.userData.part;
    let dmg = w.damage * (part === 'head' ? w.headMult : 1);
    if (bh.distance > w.range) dmg *= w.falloff;
    tracer(muzzleWorld, bh.point);
    burst(bh.point, 5, 0xd84a3a);
    hud.hitmark(false); sfx.hit();
    damage(bot, dmg, me, part);
  } else if (wh) {
    tracer(muzzleWorld, wh.point);
    burst(wh.point, 4);
  } else {
    tracer(muzzleWorld, origin.clone().add(dir.clone().multiplyScalar(60)));
  }
  hud.gun(w.name, gun.mag, gun.reserve, me.money, false);
}

function startReload() {
  const w = WEAPONS[me.weaponId];
  const gun = myGuns[me.weaponId];
  if (gun.mag >= w.mag || gun.reserve <= 0 || now < reloadingUntil) return;
  reloadingUntil = now + w.reloadMs / 1000;
  sfx.reload();
  hud.gun(w.name, gun.mag, gun.reserve, me.money, true);
}
function finishReload() {
  const w = WEAPONS[me.weaponId];
  const gun = myGuns[me.weaponId];
  const take = Math.min(w.mag - gun.mag, gun.reserve);
  gun.mag += take; gun.reserve -= take;
  hud.gun(w.name, gun.mag, gun.reserve, me.money, false);
}

// a bot's bullet: probability shaped by weapon, distance and target motion
function botShoot(bot, target) {
  const w = WEAPONS[bot.weaponId];
  const from = bot.eye().add(new THREE.Vector3(0, -0.15, 0));
  const dist = bot.pos.distanceTo(target.pos);
  const aim = chestOf(target);
  aim.x += (Math.random() - 0.5) * 1.4;
  aim.y += (Math.random() - 0.5) * 0.5;
  aim.z += (Math.random() - 0.5) * 1.4;
  tracer(from, aim, 0xffe2a8);
  burst(aim, 2);
  if (target.isPlayer) sfx.distantShot();
  else if (bot.pos.distanceTo(me.pos) < 26) sfx.distantShot();

  let p = w.kind === 'sniper' ? 0.5 : w.kind === 'rifle' ? 0.34 : w.kind === 'smg' ? 0.31 : 0.27;
  p -= Math.max(0, dist - 12) * 0.004;
  const tSpeed = target.isPlayer ? player.speed2d : 2.0;
  if (tSpeed > 3.4) p -= 0.11;
  if (target.channel) p += 0.12;
  if (Math.random() > Math.max(0.05, p)) return;
  const head = Math.random() < 0.12;
  let dmg = w.damage * (head ? w.headMult : 1);
  if (dist > w.range) dmg *= w.falloff;
  damage(target, dmg, bot, head ? 'head' : 'body');
}

// ---------------------------------------------------------------- bot jobs
const GUARD = {
  A: [[-19, -21], [-31, -18]],
  B: [[19, -21], [24, -14]],
  mid: [[4, -9]],
};
const roleOf = new Map(); // bot -> 'A' | 'B' | 'mid'
function assignRoles() {
  const j = bots.filter((b) => b.team === 'jackal');
  const w = bots.filter((b) => b.team === 'warden');
  ['A', 'A', 'B', 'B'].forEach((r, i) => roleOf.set(j[i], r));
  ['A', 'A', 'B', 'B', 'mid'].forEach((r, i) => roleOf.set(w[i], r));
}
function insideSite(pos) {
  for (const [key, s] of Object.entries(SITES)) {
    if (Math.hypot(pos.x - s.x, pos.z - s.z) <= s.r) return key;
  }
  return null;
}
function jobFor(bot) {
  const stand = { kind: 'stand', point: { x: bot.pos.x, z: bot.pos.z } };
  if (MATCH.phase !== 'live') return stand;
  const role = roleOf.get(bot) || 'mid';

  if (charge.state === 'planted') {
    const s = SITES[MATCH.plantedAtSite];
    if (bot.team === 'warden') {
      const d = Math.hypot(bot.pos.x - charge.pos.x, bot.pos.z - charge.pos.z);
      const nearest = bots.filter((b) => b.team === 'warden' && b.alive)
        .sort((a, b) => a.pos.distanceTo(charge.pos) - b.pos.distanceTo(charge.pos))[0];
      if (bot === nearest) return { kind: 'defuse', point: { x: charge.pos.x, z: charge.pos.z }, atSite: d < 1.7 };
      return { kind: 'cover', point: { x: s.x + (bot.index - 2) * 4, z: s.z + 6 } };
    }
    return { kind: 'cover', point: { x: s.x + (bot.index - 2) * 3.5, z: s.z + 4.5 } };
  }
  if (bot.team === 'jackal') {
    if (charge.state === 'dropped') {
      const nearest = bots.filter((b) => b.team === 'jackal' && b.alive)
        .sort((a, b) => a.pos.distanceTo(charge.pos) - b.pos.distanceTo(charge.pos))[0];
      if (bot === nearest || charge.carrier === bot) return { kind: 'recover', point: { x: charge.pos.x, z: charge.pos.z } };
    }
    if (charge.carrier === bot) {
      const s = SITES[bot.carrySite || 'A'];
      const inside = insideSite(bot.pos) === (bot.carrySite || 'A');
      return { kind: 'plant', point: { x: s.x, z: s.z }, atSite: inside };
    }
    const s = SITES[role === 'mid' ? 'A' : role];
    return { kind: 'push', point: { x: s.x + (bot.index - 2) * 3, z: s.z + s.r + 3 } };
  }
  // wardens hold their ground
  const g = GUARD[role][bot.index % GUARD[role].length];
  return { kind: 'hold', point: { x: g[0], z: g[1] }, face: Math.PI };
}

function startChannel(actor, kind, seconds) {
  charge.channel = { actor, kind, endsAt: now + seconds, total: seconds };
  actor.channel = charge.channel;
  return true;
}
function tryPlant(bot) {
  if (charge.state !== 'carried' || charge.carrier !== bot) return false;
  if (charge.channel) return charge.channel.actor === bot;
  if (!insideSite(bot.pos)) return false;
  return startChannel(bot, 'plant', 3.2);
}
function tryDefuse(bot) {
  if (charge.state !== 'planted') return false;
  if (charge.channel) return charge.channel.actor === bot;
  if (bot.pos.distanceTo(charge.pos) > 1.7) return false;
  return startChannel(bot, 'defuse', 5);
}
function doPlant(actor) {
  const site = insideSite(actor.pos) || 'A';
  charge.state = 'planted';
  charge.site = site;
  charge.planter = actor;
  charge.carrier = null;
  actor.hasCharge = false;
  charge.pos.set(actor.pos.x, 0, actor.pos.z);
  charge.mesh.visible = true;
  charge.mesh.position.set(actor.pos.x, 0.14, actor.pos.z);
  MATCH.plantedAtSite = site;
  MATCH.plantEndsAt = now + 35;
  sfx.planted();
  hud.banner('CHARGE PLANTED', `Site ${site} — ${SITES[site].name}`, '', 1.6);
  hud.objective(actor.team === 'jackal' ? 'Defend the Charge' : 'Defuse the Charge');
}
function tickChannel() {
  const ch = charge.channel;
  if (!ch) return;
  if (!ch.actor.alive) { ch.actor.channel = null; charge.channel = null; return; }
  if ((ch.total - (ch.endsAt - now)) > 0 && Math.floor(ch.endsAt - now) !== Math.floor(ch.endsAt - now + 0.016)) sfx.plantBeep();
  if (now >= ch.endsAt) {
    const actor = ch.actor;
    actor.channel = null;
    charge.channel = null;
    if (ch.kind === 'plant') doPlant(actor);
    else { sfx.defused(); endRound('warden', 'Charge defused'); }
  }
}

// ---------------------------------------------------------------- economy & rounds
function botBuy(bot) {
  if (bot.money >= 650 && bot.armor <= 0 && Math.random() < 0.75) { bot.armor = 100; bot.money -= 650; }
  if (bot.weaponId === 'p9') {
    const roll = Math.random();
    if (bot.money >= 3200 && roll < 0.14) { bot.weaponId = 'longbow'; bot.money -= 3200; }
    else if (bot.money >= 2700) { bot.weaponId = 'kestrel'; bot.money -= 2700; }
    else if (bot.money >= 1500) { bot.weaponId = 'rook'; bot.money -= 1500; }
    bot.ammoInMag = WEAPONS[bot.weaponId].mag;
  }
}

function startRound() {
  MATCH.round++;
  MATCH.phase = 'buy';
  MATCH.phaseEndsAt = now + 12;
  MATCH.plantedAtSite = null;
  charge.state = 'carried';
  charge.carrier = me;
  charge.channel = null;
  charge.mesh.visible = false;
  me.hasCharge = true;
  assignRoles();

  const resetFighter = (c, x, z, yaw, diedLastRound) => {
    c.hp = 100; c.alive = true;
    if (diedLastRound) c.armor = 0;
  };
  const playerDied = !me.alive && MATCH.round > 1;
  resetFighter(me, 0, 0, 0, playerDied);
  if (playerDied) {
    myPrimary = null;
    for (const k of Object.keys(myGuns)) if (k !== 'p9') delete myGuns[k];
    me.weaponId = 'p9';
    myGuns.p9 = { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
    setViewmodel();
  }
  myGuns[me.weaponId].mag = WEAPONS[me.weaponId].mag;
  player.spawnAt(SPAWNS.jackal[0][0], SPAWNS.jackal[0][1], 0);

  for (const b of bots) {
    const died = !b.alive && MATCH.round > 1;
    resetFighter(b, 0, 0, 0, died);
    if (died) b.weaponId = 'p9';
    b.hasCharge = false;
    b.carrySite = Math.random() < 0.5 ? 'A' : 'B';
    const sp = SPAWNS[b.team][b.team === 'jackal' ? b.index : b.index];
    b.spawnAt(sp[0], sp[1], b.team === 'jackal' ? 0 : Math.PI);
    botBuy(b);
  }
  for (const d of droppedGuns) scene.remove(d.mesh);
  droppedGuns.length = 0;

  hud.scores(MATCH.score.jackal, MATCH.score.warden);
  hud.objective('Plant the Charge at A or B');
  hud.banner(`ROUND ${MATCH.round}`, 'Buy phase — press B', '', 1.6);
  buyOpen = !SHOT;
  refreshBuy();
}

function endRound(winner, reason) {
  if (MATCH.phase === 'over' || MATCH.phase === 'matchover') return;
  MATCH.score[winner]++;
  for (const c of all) c.money += c.team === winner ? 2500 : 1400;
  if (charge.planter && reason.includes('detonated')) charge.planter.money += 300;
  charge.planter = null;
  if (charge.channel) { charge.channel.actor.channel = null; charge.channel = null; }
  for (const b of bots) b.target = null;
  hud.scores(MATCH.score.jackal, MATCH.score.warden);
  const won = winner === 'jackal';
  if (MATCH.score[winner] >= MATCH.targetScore) {
    MATCH.phase = 'matchover';
    MATCH.phaseEndsAt = now + 9;
    hud.banner(won ? 'MATCH WON' : 'MATCH LOST', `${MATCH.score.jackal} — ${MATCH.score.warden} · ${reason}`, won ? 'win' : 'lose', 6);
    showBoard(true);
  } else {
    MATCH.phase = 'over';
    MATCH.phaseEndsAt = now + 4.5;
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, won ? 'win' : 'lose', 2.8);
  }
  if (won) sfx.roundWin(); else sfx.roundLose();
}

function startMatch() {
  MATCH.score.jackal = 0; MATCH.score.warden = 0; MATCH.round = 0;
  for (const c of all) { c.money = 800; c.kills = 0; c.deaths = 0; c.armor = 0; }
  for (const b of bots) b.weaponId = 'p9';
  myPrimary = null;
  for (const k of Object.keys(myGuns)) if (k !== 'p9') delete myGuns[k];
  me.weaponId = 'p9';
  myGuns.p9 = { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
  setViewmodel();
  startRound();
}

// ---------------------------------------------------------------- buy menu (player)
let buyOpen = false;
function refreshBuy() {
  const items = BUY_MENU.map((it) => {
    let owned = false;
    if (it.slot === 'armor') owned = me.armor > 0;
    if (it.slot === 'primary') owned = myPrimary === it.weapon;
    return { key: it.key.replace('Digit', ''), label: it.label, desc: it.desc, price: it.price ?? WEAPONS[it.weapon].price, owned };
  });
  hud.buyMenu(items, me.money, fmtClock(MATCH.phaseEndsAt - now));
  hud.toggleBuy(buyOpen && MATCH.phase === 'buy');
}
function tryBuy(code) {
  const it = BUY_MENU.find((b) => b.key === code);
  if (!it) return;
  if (it.slot === 'armor') {
    if (me.armor > 0 || me.money < it.price) { sfx.denied(); return; }
    me.armor = 100; me.money -= it.price; sfx.buy();
  } else if (it.slot === 'primary') {
    const price = WEAPONS[it.weapon].price;
    if (myPrimary === it.weapon || me.money < price) { sfx.denied(); return; }
    myPrimary = it.weapon;
    myGuns[it.weapon] = { mag: WEAPONS[it.weapon].mag, reserve: WEAPONS[it.weapon].reserve };
    me.weaponId = it.weapon;
    me.money -= price;
    setViewmodel();
    sfx.buy();
  }
  refreshBuy();
  hud.gun(WEAPONS[me.weaponId].name, myGuns[me.weaponId].mag, myGuns[me.weaponId].reserve, me.money, false);
}

function showBoard(open) {
  const rows = (team) => all.filter((c) => c.team === team)
    .sort((a, b) => b.kills - a.kills)
    .map((c) => ({ name: c.name, k: c.kills, d: c.deaths, money: c.money, alive: c.alive, me: c.isPlayer }));
  hud.board(rows('jackal'), rows('warden'), open);
}

// ---------------------------------------------------------------- player objective & pickups
let playerPlantT = 0;
function tickPlayerObjective(dt, frame) {
  hud.interact(null);
  if (!me.alive || MATCH.phase !== 'live') { playerPlantT = 0; return; }
  // plant: hold E inside a site while carrying the Charge
  if (charge.state === 'carried' && charge.carrier === me && insideSite(me.pos) && !charge.channel) {
    if (input.down('KeyE')) {
      playerPlantT += dt;
      if (Math.floor(playerPlantT) !== Math.floor(playerPlantT - dt)) sfx.plantBeep();
      hud.interact('PLANTING THE CHARGE', playerPlantT / 3.2);
      if (playerPlantT >= 3.2) { playerPlantT = 0; startChannel(me, 'plant', 0.01); }
    } else playerPlantT = 0;
  }
  // pickups: the dropped Charge and dropped primaries
  if (charge.state === 'dropped' && me.pos.distanceTo(charge.pos) < 1.4) {
    charge.state = 'carried'; charge.carrier = me; me.hasCharge = true;
    charge.mesh.visible = false;
    hud.objective('Plant the Charge at A or B');
  }
  for (let i = droppedGuns.length - 1; i >= 0; i--) {
    const d = droppedGuns[i];
    if (!myPrimary && me.pos.distanceTo(d.pos) < 1.3) {
      myPrimary = d.weaponId;
      myGuns[d.weaponId] = { mag: WEAPONS[d.weaponId].mag, reserve: WEAPONS[d.weaponId].mag };
      scene.remove(d.mesh);
      droppedGuns.splice(i, 1);
      hud.feed(`You picked up a <b class="us">${WEAPONS[myPrimary].name}</b>`);
    }
  }
  // bots pick up the Charge / guns in their own tick
  for (const b of bots) {
    if (!b.alive) continue;
    if (charge.state === 'dropped' && b.team === 'jackal' && b.pos.distanceTo(charge.pos) < 1.3) {
      charge.state = 'carried'; charge.carrier = b; b.hasCharge = true;
      charge.mesh.visible = false;
    }
  }
}

// ---------------------------------------------------------------- frame loop
const clock = new THREE.Clock();
let rmbDown = false;
addEventListener('mousedown', (e) => { if (e.button === 2) rmbDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) rmbDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => { if (e.code === 'KeyB' && MATCH.phase === 'buy' && me.alive) { buyOpen = !buyOpen; refreshBuy(); } });

function phaseTick() {
  if (MATCH.phase === 'buy') {
    hud.clock(fmtClock(MATCH.phaseEndsAt - now), `Round ${MATCH.round} · Buy`, false);
    if (buyOpen) refreshBuy();
    if (now >= MATCH.phaseEndsAt) {
      MATCH.phase = 'live';
      MATCH.roundEndsAt = now + 100;
      buyOpen = false;
      hud.toggleBuy(false);
      hud.banner(`ROUND ${MATCH.round}`, 'Sites are live', '', 1.4);
    }
  } else if (MATCH.phase === 'live') {
    if (charge.state === 'planted') {
      hud.clock(fmtClock(MATCH.plantEndsAt - now), 'Charge planted', true);
      if (now >= MATCH.plantEndsAt) {
        sfx.explosion();
        burst(charge.pos.clone().setY(1), 42, 0xff8a2a);
        burst(charge.pos.clone().setY(1), 26, 0xffd98a);
        charge.mesh.visible = false;
        endRound('jackal', 'Charge detonated');
      }
    } else {
      hud.clock(fmtClock(MATCH.roundEndsAt - now), `Round ${MATCH.round}`, MATCH.roundEndsAt - now < 15);
      if (now >= MATCH.roundEndsAt) endRound('warden', 'Time — the sites held');
    }
  } else if (MATCH.phase === 'over' || MATCH.phase === 'matchover') {
    hud.clock('—', MATCH.phase === 'over' ? 'Round over' : 'Match over', false);
    if (now >= MATCH.phaseEndsAt) {
      showBoard(false);
      if (MATCH.phase === 'matchover') startMatch();
      else startRound();
    }
  }
}

function playerTick(dt, frame) {
  const frozen = MATCH.phase !== 'live' && MATCH.phase !== 'buy' || !me.alive;
  player.update(dt, input, frame, frozen || SHOT !== null);
  if (player.footstep) { player.footstep = false; sfx.step(); }

  if (!me.alive) {
    // death cam: slumped at the fall point, watching the round play out
    camera.position.set(player.pos.x, 0.5, player.pos.z);
    camera.rotation.set(-0.4, player.yaw, 0.35);
    if (viewmodel) viewmodel.visible = false;
    return;
  }
  if (viewmodel) viewmodel.visible = true;
  player.applyCamera(camera);

  // viewmodel life: recoil spring, walk bob, ADS blend for the Longbow
  recoil = Math.max(0, recoil - dt * 6.5);
  const w = WEAPONS[me.weaponId];
  const wantAds = rmbDown && w.zoom > 1 ? 1 : 0;
  adsAmt += (wantAds - adsAmt) * Math.min(1, dt * 9);
  const targetFov = 74 / (1 + (w.zoom - 1) * adsAmt);
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  if (viewmodel) {
    const bob = Math.sin(now * 9) * 0.006 * Math.min(1, player.speed2d / 4);
    viewmodel.position.set(
      0.24 - adsAmt * 0.24,
      -0.22 + bob - adsAmt * 0.055,
      -0.45 + recoil * 0.085,
    );
    viewmodel.rotation.x = recoil * 0.14;
  }

  if (SHOT) return;
  // shooting
  const gun = myGuns[me.weaponId];
  if (now >= reloadingUntil && reloadingUntil > 0 && lastShotAt < reloadingUntil) finishReload();
  if (MATCH.phase === 'live' && input.locked) {
    if (w.auto) {
      if (input.firing && now - lastShotAt >= 60 / w.rpm) playerShoot();
    } else {
      if (input.firing && !triggerHeld && now - lastShotAt >= 60 / w.rpm) playerShoot();
    }
  }
  triggerHeld = input.firing;
  bloom = Math.max(0, bloom - WEAPONS[me.weaponId].settlePerSec * dt * (player.speed2d > 0.5 ? 0.4 : 1));

  // keys that act on press
  if (frame.pressed.has('KeyR')) startReload();
  if (frame.pressed.has('Digit1') && me.weaponId !== 'p9') { me.weaponId = 'p9'; setViewmodel(); }
  if (frame.pressed.has('Digit2') && MATCH.phase !== 'buy' && myPrimary && me.weaponId !== myPrimary) { me.weaponId = myPrimary; setViewmodel(); }
  if (MATCH.phase === 'buy') {
    for (const code of frame.pressed) if (code.startsWith('Digit')) tryBuy(code);
  }
  showBoard(input.down('Tab'));
}

let gunCache = '';
function hudTick() {
  const usAlive = all.filter((c) => c.team === 'jackal' && c.alive).length;
  const themAlive = all.filter((c) => c.team === 'warden' && c.alive).length;
  hud.vitals(me.hp, me.armor, usAlive, themAlive);
  const w = WEAPONS[me.weaponId];
  const gun = myGuns[me.weaponId] || myGuns.p9;
  const key = `${w.name}|${gun.mag}|${gun.reserve}|${me.money}|${now < reloadingUntil}`;
  if (key !== gunCache) {
    gunCache = key;
    hud.gun(w.name, gun.mag, gun.reserve, me.money, now < reloadingUntil);
  }
  // the Charge carrier marker: a soft pulse on the planted charge's lamp
  if (charge.mesh.visible) {
    const lamp = charge.mesh.children[1];
    lamp.material.emissiveIntensity = charge.state === 'planted' ? (Math.sin(now * 9) > 0 ? 3.4 : 0.4) : 1.6;
  }
}

function botTick(dt) {
  for (const b of bots) {
    b.update(dt, {
      dt, now, colliders: world.colliders, waypoints: world.waypoints,
      foes: MATCH.phase === 'live' ? foesOf(b) : [],
      phase: MATCH.phase,
      shoot: botShoot, jobFor, tryPlant, tryDefuse,
    });
  }
}

function fxTick(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    if (now > tracers[i].until) {
      scene.remove(tracers[i].line);
      tracers[i].line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    if (now > s.until) { scene.remove(s.m); sparks.splice(i, 1); continue; }
    s.m.position.addScaledVector(s.m.userData.v, dt);
    s.m.userData.v.y -= 7 * dt;
  }
}

let framesRendered = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  now += dt;
  const frame = input.consume();

  if (MATCH.phase !== 'title') {
    phaseTick();
    playerTick(dt, frame);
    botTick(dt);
    tickChannel();
    tickPlayerObjective(dt, frame);
    hudTick();
  }
  fxTick(dt);
  world.update(now);
  renderer.render(scene, camera);
  framesRendered++;
  if (SHOT && framesRendered === 30) window.__shotReady = true;
}

// ---------------------------------------------------------------- staging for screenshots
function stageShot(mode) {
  hud.showGame();
  startMatch(); // round 1, buy phase, everyone at spawn
  if (mode === 'start') {
    buyOpen = true;
    MATCH.phaseEndsAt = now + 8;
    refreshBuy();
  } else if (mode === 'play') {
    MATCH.phase = 'live';
    MATCH.roundEndsAt = now + 47;
    buyOpen = false; hud.toggleBuy(false);
    me.weaponId = 'kestrel';
    myPrimary = 'kestrel';
    myGuns.kestrel = { mag: 17, reserve: 50 };
    setViewmodel();
    me.hp = 72; me.armor = 40;
    player.spawnAt(2, 12, -0.3);
    const wardens = bots.filter((b) => b.team === 'warden');
    wardens[0].spawnAt(7, -3, Math.PI); wardens[0].weaponId = 'p9';
    wardens[1].spawnAt(13, -9, Math.PI); wardens[1].weaponId = 'p9';
    const jacks = bots.filter((b) => b.team === 'jackal');
    jacks[0].spawnAt(8, 4, -0.4);
    jacks[1].spawnAt(12, 2, -0.3);
    // a staged shot mid-flight: tracer + impact sparks on the lead Warden
    const from = new THREE.Vector3(2.6, 1.35, 11.2);
    const to = new THREE.Vector3(7, 1.25, -3);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, until: now + 9999 });
    burst(to, 7, 0xffc46b);
    recoil = 0.85;
    hud.feed('<b class="us">Sable</b><span class="wpn">KESTREL</span><b class="them">Hale</b>');
    hud.feed('<b class="them">Onyx</b><span class="wpn">ROOK</span><b class="us">Milo</b>');
    hud.objective('Plant the Charge at A or B — mid is contested');
  } else if (mode === 'end') {
    MATCH.score.jackal = 4; MATCH.score.warden = 2;
    MATCH.phase = 'over';
    MATCH.phaseEndsAt = now + 999;
    buyOpen = false; hud.toggleBuy(false);
    player.spawnAt(-19, -23, 1.1);
    me.hp = 38; me.armor = 15;
    charge.state = 'planted';
    charge.mesh.visible = true;
    charge.mesh.position.set(-23, 0.14, -24);
    charge.pos.set(-23, 0, -24);
    MATCH.plantedAtSite = 'A';
    const wardens = bots.filter((b) => b.team === 'warden');
    wardens[0].hp = 0; wardens[0].die(); wardens[0].pos.set(-21, 0, -21); wardens[0].syncMesh(0);
    wardens[1].hp = 0; wardens[1].die(); wardens[1].pos.set(-29, 0, -29); wardens[1].syncMesh(0);
    hud.scores(4, 2);
    hud.banner('ROUND WON', 'Charge detonated at the Furnace', 'win', 999);
    hud.objective('Site A taken');
  }
}

// ---------------------------------------------------------------- boot
document.getElementById('playBtn').addEventListener('click', () => {
  sfx.ensure();
  hud.showGame();
  startMatch();
});
addEventListener('pointerdown', () => sfx.ensure(), { once: true });
if (SHOT) stageShot(SHOT);
else { camera.position.set(-17, 13, 37); camera.lookAt(0, 1, -16); }
loop();
