// NEON HARBOR — the on-foot player: WASD movement relative to the
// camera yaw, run, jump, and the third-person chase camera that follows
// the player or the car they are driving.

import { PLAYER, clamp, angleDiff } from './config.js';
import { makePersonMesh } from './peds.js';

const T = window.THREE;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makePersonMesh(0xff8c4a, 0xc89878);
    this.mesh.name = 'player';
    this.scene.add(this.mesh);
    this.x = 0; this.z = 30; this.y = 0;
    this.vy = 0;
    this.heading = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.health = PLAYER.health;
    this.lastHurt = -99;
    this.inCar = false;
  }

  setPosition(x, z, heading) {
    this.x = x; this.z = z;
    if (heading !== undefined) {
      this.heading = heading;
      this.camYaw = heading;
    }
    this.mesh.position.set(x, this.y, z);
    this.mesh.rotation.y = heading;
  }

  // input: {up, down, left, right, run, jump}. camera: THREE camera to
  // position. dt seconds. resolveCollision from the city.
  update(dt, t, input, camera, resolveCollision) {
    // Health regen after a quiet spell.
    if (t - this.lastHurt > PLAYER.regenDelay && this.health < PLAYER.health) {
      this.health = Math.min(PLAYER.health, this.health + PLAYER.regen * dt);
    }
    if (this.inCar) {
      // Camera is handled by the car in main.js; keep the mesh hidden.
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    let mx = 0;
    let mz = 0;
    if (input.up) mz -= 1;
    if (input.down) mz += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      const targetHeading = Math.atan2(wx, wz);
      const diff = angleDiff(targetHeading, this.heading);
      this.heading += clamp(diff, -9 * dt, 9 * dt);
      const nx = this.x + wx * speed * dt;
      const nz = this.z + wz * speed * dt;
      const hit = resolveCollision ? resolveCollision(nx, nz, 0.6) : { x: nx, z: nz };
      this.x = clamp(hit.x, -300, 300);
      this.z = clamp(hit.z, -300, 300);
    }
    // Jump + gravity.
    if (input.jump && this.y <= 0.01) this.vy = PLAYER.jumpSpeed;
    this.vy -= PLAYER.gravity * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    this.mesh.position.set(this.x, this.y + (moving ? Math.abs(Math.sin(t * 9)) * 0.05 : 0), this.z);
    this.mesh.rotation.y = this.heading;
    this.updateCamera(dt, camera);
  }

  updateCamera(dt, camera) {
    const target = this.inCar ? null : { x: this.x, z: this.z, y: this.y + 1.6 };
    if (!target) return;
    const cx = target.x - Math.sin(this.camYaw) * this.camDist;
    const cz = target.z - Math.cos(this.camYaw) * this.camDist;
    const cy = target.y + this.camDist * Math.tan(this.camPitch) + 1.2;
    camera.position.x += (cx - camera.position.x) * Math.min(1, 8 * dt);
    camera.position.y += (cy - camera.position.y) * Math.min(1, 8 * dt);
    camera.position.z += (cz - camera.position.z) * Math.min(1, 8 * dt);
    camera.lookAt(target.x, target.y, target.z);
  }

  // Chase camera behind a car, smoothed.
  followCar(dt, camera, car) {
    const back = 11;
    const up = 4.6;
    const cx = car.x - Math.sin(car.heading) * back;
    const cz = car.z - Math.cos(car.heading) * back;
    camera.position.x += (cx - camera.position.x) * Math.min(1, 6 * dt);
    camera.position.y += (up - camera.position.y) * Math.min(1, 6 * dt);
    camera.position.z += (cz - camera.position.z) * Math.min(1, 6 * dt);
    camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
    this.camYaw = car.heading;
  }

  hurt(amount, t) {
    this.health -= amount;
    this.lastHurt = t;
    return this.health <= 0;
  }
}
