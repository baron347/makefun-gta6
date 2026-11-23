// NEON HARBOR — the player on foot plus the third-person / chase camera.
// Driving itself lives in vehicles.js; this module owns the walker, the
// character mesh, and where the camera sits in both modes.

import { PLAYER, clamp, headingVec } from './config.js';

const THREE = window.THREE;

function makePlayerMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.3), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8a075, roughness: 0.7 }),
  );
  head.position.y = 1.7;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 }),
  );
  hair.position.y = 1.74;
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.62, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.9 }),
  );
  legs.position.y = 0.31;
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.14, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4, metalness: 0.6 }),
  );
  pistol.position.set(0.32, 1.05, 0.18);
  pistol.name = 'pistol';
  group.add(body, head, hair, legs, pistol);
  return group;
}

export class Player {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.x = 0;
    this.z = 60;
    this.y = 0; // jump height above ground
    this.vy = 0;
    this.heading = Math.PI; // facing north (-Z)
    this.camYaw = 0; // camera orbit; W walks along the camera forward
    this.camPitch = 0.32;
    this.mesh = makePlayerMesh();
    this.scene.add(this.mesh);
    this.walkPhase = 0;
  }

  setPosition(x, z, heading) {
    this.x = x;
    this.z = z;
    if (heading !== undefined) {
      this.heading = heading;
      this.camYaw = heading + Math.PI;
    }
    this.y = 0;
    this.vy = 0;
    this._syncMesh();
  }

  get speed() {
    return this._speed || 0;
  }

  // input: {forward, back, left, right, run, jump}
  update(dt, input) {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Camera forward on the ground plane: W walks away from the camera.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      this.heading = Math.atan2(mx, mz);
      this._speed = speed;
      this.walkPhase += dt * speed * 2.2;
    } else {
      this._speed = 0;
    }
    // Jump + gravity.
    if (input.jump && this.y === 0) this.vy = PLAYER.jumpVel;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= PLAYER.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    this.city.resolveCircle(this, 0.6);
    this.x = clamp(this.x, -298, 298);
    this.z = clamp(this.z, -298, 298);
    this._syncMesh();
  }

  _syncMesh() {
    const bob = this._speed > 0 ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    this.mesh.position.set(this.x, this.y + bob, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Place the camera for this frame. `car` is the driven car or null.
  // `override` (shots) is {pos:{x,y,z}, look:{x,y,z}} and wins outright.
  updateCamera(camera, dt, car, override) {
    if (override) {
      camera.position.set(override.pos.x, override.pos.y, override.pos.z);
      camera.lookAt(override.look.x, override.look.y, override.look.z);
      return;
    }
    const k = Math.min(1, dt * 5); // smoothing
    if (car) {
      const back = 8.5;
      const up = 3.6;
      const fwd = headingVec(car.heading);
      const tx = car.x - fwd.x * back;
      const tz = car.z - fwd.z * back;
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (up - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
      camera.lookAt(car.x + fwd.x * 6, 1.4, car.z + fwd.z * 6);
    } else {
      const dist = 8.5;
      const pitch = this.camPitch;
      const cx = this.x + Math.sin(this.camYaw) * dist * Math.cos(pitch);
      const cz = this.z + Math.cos(this.camYaw) * dist * Math.cos(pitch);
      const cy = 1.6 + Math.sin(pitch) * dist;
      camera.position.x += (cx - camera.position.x) * k;
      camera.position.y += (cy - camera.position.y) * k;
      camera.position.z += (cz - camera.position.z) * k;
      camera.lookAt(this.x, 1.5, this.z);
    }
  }

  hide() {
    this.mesh.visible = false;
  }

  show() {
    this.mesh.visible = true;
  }
}
