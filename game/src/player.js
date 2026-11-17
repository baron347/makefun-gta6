// NEON HARBOR — the on-foot player: WASD movement relative to the
// camera, run, jump, and the third-person / chase camera that follows
// the player or the car they are driving.

import { PLAYER, clamp, angleDiff } from './config.js';
import { makePersonMesh } from './peds.js';

export function createPlayer(scene) {
  const mesh = makePersonMesh(0xd8c84a, 0xe8b88a);
  // A pistol in the right hand, visible while on foot.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.33, 0.82, 0.18);
  mesh.add(gun);
  scene.add(mesh);

  const P = {
    mesh,
    gun,
    x: 0,
    z: 20,
    y: 0,
    vy: 0,
    heading: Math.PI,
    speed: 0,
    health: PLAYER.health,
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 8.5,
    walkPhase: 0,
    onGround: true,
  };

  function setPosition(x, z, heading) {
    P.x = x;
    P.z = z;
    P.y = 0;
    P.vy = 0;
    if (heading !== undefined) {
      P.heading = heading;
      P.camYaw = heading + Math.PI;
    }
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading ?? P.heading;
  }

  // keys: {KeyW, KeyA, KeyS, KeyD, ShiftLeft/ShiftRight}; mouseDX/DY are
  // accumulated pointer movement since the last frame.
  function update(dt, keys, mouseDX, mouseDY, city, inCar) {
    if (inCar) return;
    P.camYaw -= mouseDX * 0.0032;
    P.camPitch = clamp(P.camPitch + mouseDY * 0.0022, 0.06, 1.15);

    // Movement is relative to where the camera looks.
    const fwdX = -Math.sin(P.camYaw);
    const fwdZ = -Math.cos(P.camYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    let mx = 0;
    let mz = 0;
    if (keys.KeyW) { mx += fwdX; mz += fwdZ; }
    if (keys.KeyS) { mx -= fwdX; mz -= fwdZ; }
    if (keys.KeyD) { mx += rightX; mz += rightZ; }
    if (keys.KeyA) { mx -= rightX; mz -= rightZ; }
    const moving = mx !== 0 || mz !== 0;
    const run = keys.ShiftLeft || keys.ShiftRight;
    const target = moving ? (run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    P.speed += (target - P.speed) * Math.min(1, dt * 10);
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const wantH = Math.atan2(mx, mz);
      P.heading += clamp(angleDiff(wantH, P.heading), -8 * dt, 8 * dt);
      P.x += Math.sin(P.heading) * P.speed * dt;
      P.z += Math.cos(P.heading) * P.speed * dt;
      P.x = clamp(P.x, -298, 298);
      P.z = clamp(P.z, -298, 298);
      city.resolveCircle(P, 0.55);
      P.walkPhase += dt * P.speed * 2.4;
      const swing = Math.sin(P.walkPhase) * 0.55;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
      mesh.userData.armL.rotation.x = -swing * 0.6;
      mesh.userData.armR.rotation.x = swing * 0.6;
    } else {
      mesh.userData.legL.rotation.x *= 0.8;
      mesh.userData.legR.rotation.x *= 0.8;
      mesh.userData.armL.rotation.x *= 0.8;
      mesh.userData.armR.rotation.x *= 0.8;
    }

    // Jump + gravity.
    if (keys.Space && P.onGround) {
      P.vy = PLAYER.jumpSpeed;
      P.onGround = false;
    }
    if (!P.onGround) {
      P.vy -= PLAYER.gravity * dt;
      P.y += P.vy * dt;
      if (P.y <= 0) {
        P.y = 0;
        P.vy = 0;
        P.onGround = true;
      }
    }
    mesh.position.set(P.x, P.y, P.z);
    mesh.rotation.y = P.heading;
  }

  // Third-person camera. `car` is the driven car or null.
  function updateCamera(camera, dt, car, snap = false) {
    if (car) {
      // Chase cam: behind the car, smoothed.
      const back = 8.5;
      const up = 3.6;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const tx = car.x - fx * back;
      const tz = car.z - fz * back;
      const k = snap ? 1 : Math.min(1, dt * 5);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (up - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
      camera.lookAt(car.x + fx * 7, 1.2, car.z + fz * 7);
      return;
    }
    const dist = P.camDist;
    const cy = Math.cos(P.camPitch);
    const sy = Math.sin(P.camPitch);
    const cx = P.x + Math.sin(P.camYaw) * dist * cy;
    const cz = P.z + Math.cos(P.camYaw) * dist * cy;
    const cyy = 1.6 + dist * sy;
    if (snap) {
      camera.position.set(cx, cyy, cz);
    } else {
      const k = Math.min(1, dt * 14);
      camera.position.x += (cx - camera.position.x) * k;
      camera.position.y += (cyy - camera.position.y) * k;
      camera.position.z += (cz - camera.position.z) * k;
    }
    camera.lookAt(P.x, 1.5, P.z);
  }

  // Return the live object (not a copy): the playtests read
  // player.x / .z / .speed / .health straight off it.
  P.setPosition = setPosition;
  P.update = update;
  P.updateCamera = updateCamera;
  return P;
}
