// bots.js — the other nine soldiers. Each bot is a low-poly figure in team
// colours with its callsign overhead, driven by a small state machine over
// the waypoint graph: attackers push a chosen site and plant the Charge,
// defenders hold ground and rotate when it goes down. In a fight a bot
// stops, settles, and fires bursts — its accuracy is a probability shaped by
// distance, its weapon and whether the target is moving, which keeps fights
// readable and fair-feeling without a physics cost per bullet.

import * as THREE from 'three';
import { collide, lineClear, findPath, nearestNode } from './world.js';
import { WEAPONS } from './weapons.js';

const NAMES = {
  jackal: ['You', 'Rook', 'Sable', 'Milo', 'Vesper'],
  warden: ['Hale', 'Onyx', 'Petra', 'Cato', 'Wren'],
};

function callsignSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const ctx = c.getContext('2d');
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(5,6,8,.55)';
  const w = ctx.measureText(name).width + 26;
  ctx.fillRect((256 - w) / 2, 8, w, 40);
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 39);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.28, 1);
  return s;
}

export function buildBotMesh(team) {
  const g = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: team === 'jackal' ? 0x8a6420 : 0x1f6f66, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98a64, roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: team === 'jackal' ? 0xd88f2e : 0x39d3c0, roughness: 0.7 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), dark); legL.position.set(-0.12, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), uniform); torso.position.y = 1.09;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.36), vest); chest.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin); head.position.y = 1.58;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), dark); helmet.position.y = 1.76;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), dark); gun.position.set(0.18, 1.24, -0.3);
  g.add(legL, legR, torso, chest, head, helmet, gun);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { group: g, head, torso, chest, gun, legL, legR };
}

export class Bot {
  constructor(team, index, scene) {
    this.team = team;
    this.index = index;
    this.name = NAMES[team][index];
    this.isPlayer = false;
    const built = buildBotMesh(team);
    this.mesh = built.group;
    this.parts = built;
    this.headMesh = built.head;
    this.bodyMeshes = [built.torso, built.chest];
    for (const m of [this.headMesh, ...this.bodyMeshes]) { m.userData.bot = this; }
    this.headMesh.userData.part = 'head';
    for (const m of this.bodyMeshes) m.userData.part = 'body';
    this.tag = callsignSprite(this.name, team === 'jackal' ? '#ffb454' : '#39d3c0');
    this.tag.position.y = 2.15;
    this.mesh.add(this.tag);
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.hp = 100;
    this.armor = 0;
    this.alive = true;
    this.money = 800;
    this.kills = 0; this.deaths = 0;
    this.weaponId = 'p9';
    this.hasCharge = false;

    // AI state
    this.path = [];
    this.pathI = 0;
    this.goal = null;        // Vector3 goal when walking off-graph
    this.think = Math.random() * 0.15;
    this.target = null;      // combatant being engaged
    this.lastSeenAt = -99;
    this.burstAt = 0;
    this.burstLeft = 0;
    this.nextShotAt = 0;
    this.reloadUntil = 0;
    this.ammoInMag = WEAPONS.p9.mag;
    this.channel = null;     // {kind: 'plant'|'defuse', until}
    this.strafeDir = 1;
    this.strafeAt = 0;
    this.walkPhase = Math.random() * 6;
  }

  spawnAt(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.hp = 100;
    this.alive = true;
    this.target = null;
    this.path = [];
    this.channel = null;
    this.ammoInMag = WEAPONS[this.weaponId].mag;
    this.mesh.visible = true;
    this.syncMesh(0);
  }

  eye() { return new THREE.Vector3(this.pos.x, 1.55, this.pos.z); }
  chestPos() { return new THREE.Vector3(this.pos.x, 1.15, this.pos.z); }

  setGoalPath(waypoints, tx, tz) {
    const from = nearestNode(waypoints, this.pos.x, this.pos.z);
    const to = nearestNode(waypoints, tx, tz);
    this.path = findPath(waypoints, from, to).map((i) => waypoints[i]);
    this.pathI = 0;
    this.goal = { x: tx, z: tz };
  }

  // ctx: {dt, now, colliders, waypoints, foes, allies, phase, charge, sites,
  //       shoot: (bot, target) => void, tryPlant: (bot) => bool,
  //       tryDefuse: (bot) => bool, speed}
  update(dt, ctx) {
    if (!this.alive) return;
    const now = ctx.now;
    this.think -= dt;

    // --- perception (checked on think ticks) ---
    if (this.think <= 0) {
      this.think = 0.11 + Math.random() * 0.05;
      let best = null, bd = 58 * 58;
      for (const f of ctx.foes) {
        if (!f.alive) continue;
        const d2 = (f.pos.x - this.pos.x) ** 2 + (f.pos.z - this.pos.z) ** 2;
        if (d2 > bd) continue;
        if (!lineClear(this.pos.x, this.pos.z, f.pos.x, f.pos.z, ctx.colliders)) continue;
        bd = d2; best = f;
      }
      if (best) { this.target = best; this.lastSeenAt = now; }
      else if (now - this.lastSeenAt > 1.6) this.target = null;
    }

    // --- channelling the objective stands still and finishes in main ---
    if (this.channel) { this.syncMesh(dt); return; }

    let moveX = 0, moveZ = 0, speed = 0;

    if (this.target && this.target.alive) {
      // combat: face the target, hold a fighting distance, strafe a little
      const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      this.yaw = Math.atan2(-dx, -dz);
      const w = WEAPONS[this.weaponId];
      const want = w.kind === 'sniper' ? 30 : w.kind === 'smg' ? 13 : 20;
      if (now > this.strafeAt) { this.strafeAt = now + 0.7 + Math.random() * 0.9; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      const px = -dz / (dist || 1), pz = dx / (dist || 1);
      moveX = px * this.strafeDir * 0.8;
      moveZ = pz * this.strafeDir * 0.8;
      if (dist > want + 4) { moveX += dx / dist * 1.6; moveZ += dz / dist * 1.6; }
      if (dist < want - 5) { moveX -= dx / dist * 1.2; moveZ -= dz / dist * 1.2; }
      speed = 2.2;

      // fire control: bursts with pauses, reloads when dry
      if (now >= this.reloadUntil) {
        if (this.burstLeft <= 0 && now >= this.burstAt) {
          this.burstLeft = w.kind === 'sniper' ? 1 : 2 + (Math.random() * 3 | 0);
          this.burstAt = now + 0.55 + Math.random() * 0.75;
        }
        if (this.burstLeft > 0 && now >= this.nextShotAt) {
          this.nextShotAt = now + 60 / w.rpm;
          this.burstLeft--;
          if (this.ammoInMag > 0) { this.ammoInMag--; ctx.shoot(this, this.target); }
          if (this.ammoInMag <= 0) {
            this.reloadUntil = now + w.reloadMs / 1000;
            this.ammoInMag = w.mag;
          }
        }
      }
    } else {
      // --- objective behaviour when not fighting ---
      const job = ctx.jobFor(this);
      if (job) {
        if (job.kind === 'plant' && job.atSite) {
          if (ctx.tryPlant(this)) { this.syncMesh(dt); return; }
        }
        if (job.kind === 'defuse' && job.atSite) {
          if (ctx.tryDefuse(this)) { this.syncMesh(dt); return; }
        }
        const dest = job.point;
        const dGoal = Math.hypot(dest.x - this.pos.x, dest.z - this.pos.z);
        if (dGoal > 1.2) {
          if (!this.path.length || this.pathI >= this.path.length ||
              Math.hypot(this.path[this.path.length - 1].x - dest.x, this.path[this.path.length - 1].z - dest.z) > 3) {
            this.setGoalPath(ctx.waypoints, dest.x, dest.z);
          }
          const node = this.path[Math.min(this.pathI, this.path.length - 1)];
          const tgt = this.pathI < this.path.length ? node : dest;
          const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
          const dd = Math.hypot(dx, dz);
          if (dd < 1.1 && this.pathI < this.path.length) this.pathI++;
          else if (dd > 0.05) {
            moveX = dx / dd; moveZ = dz / dd;
            this.yaw = Math.atan2(-moveX, -moveZ);
            speed = ctx.phase === 'live' ? 3.6 : 0;
          }
        } else if (job.face !== undefined) {
          this.yaw = job.face;
        }
      }
    }

    if (speed > 0) {
      const len = Math.hypot(moveX, moveZ) || 1;
      this.pos.x += (moveX / len) * speed * dt;
      this.pos.z += (moveZ / len) * speed * dt;
      collide(this.pos, 0.42, ctx.colliders);
      this.walkPhase += dt * speed * 2.4;
    }
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const sw = Math.sin(this.walkPhase) * 0.4;
    this.parts.legL.rotation.x = sw;
    this.parts.legR.rotation.x = -sw;
    if (!this.alive) {
      this.mesh.rotation.z = Math.PI / 2 * 0.94;
      this.mesh.position.y = 0.25;
      this.tag.visible = false;
    } else {
      this.mesh.rotation.z = 0;
      this.mesh.position.y = 0;
      this.tag.visible = true;
    }
  }

  die() {
    this.alive = false;
    this.deaths++;
    this.channel = null;
    this.syncMesh(0);
  }
}
