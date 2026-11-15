// player.js — the first-person body: pointer-lock look, WASD movement with a
// little weight, a small jump, and circle-vs-box collision against the same
// colliders the bots use, so cover works the same for everyone.

import * as THREE from 'three';
import { collide } from './world.js';

export class Player {
  constructor(colliders) {
    this.colliders = colliders;
    this.pos = new THREE.Vector3(0, 0, 37); // feet
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;   // face north (toward the sites) from the south yard
    this.pitch = 0;
    this.eyeHeight = 1.62;
    this.radius = 0.42;
    this.onGround = true;
    this.speed2d = 0;
    this.stepAcc = 0;
  }

  spawnAt(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  update(dt, input, frame, frozen) {
    if (!frozen) {
      this.yaw -= frame.dx * 0.0021;
      this.pitch -= frame.dy * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    const walk = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = frozen ? 0 : (walk ? 2.5 : 4.7);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (!frozen) {
      if (input.down('KeyW')) { mx += -sin; mz += -cos; }
      if (input.down('KeyS')) { mx += sin; mz += cos; }
      if (input.down('KeyA')) { mx += -cos; mz += sin; }
      if (input.down('KeyD')) { mx += cos; mz += -sin; }
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx = mx / len * speed; mz = mz / len * speed; }
    // a touch of acceleration so starting and stopping have weight
    const blend = Math.min(1, dt * 11);
    this.vel.x += (mx - this.vel.x) * blend;
    this.vel.z += (mz - this.vel.z) * blend;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);

    if (!frozen && input.down('Space') && this.onGround) {
      this.vel.y = 4.6;
      this.onGround = false;
    }
    this.vel.y -= 12.5 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }

    collide(this.pos, this.radius, this.colliders);

    // footsteps cadence for main.js to sonify
    if (this.onGround && this.speed2d > 0.6) {
      this.stepAcc += dt * this.speed2d;
      if (this.stepAcc > 2.4) { this.stepAcc = 0; this.footstep = true; }
    }
  }

  applyCamera(camera) {
    const e = this.eye();
    camera.position.copy(e);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(this.yaw);
    camera.rotateX(this.pitch);
  }
}
