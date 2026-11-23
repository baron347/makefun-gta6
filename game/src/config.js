// NEON HARBOR — shared constants, seeded RNG, mission script.
// Everything the other modules need to agree on lives here.

export const CITY = {
  blocks: 9, // 9x9 blocks
  pitch: 60, // metres between neighbouring road centrelines
  roadWidth: 14,
  sidewalk: 3,
  span: 300, // city runs -300..300 on both axes
  roadCount: 10, // road centrelines at -300 + i*60, i = 0..9
};

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.5,
  jumpVel: 6.5,
  gravity: 18,
  healthMax: 100,
};

export const DRIVING = {
  accel: 16,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 34,
  maxReverse: 10,
  maxSteer: 0.55,
  handbrakeTurn: 1.7,
};

export const SAVE_KEY = 'neonharbor-save-v1';

// --- Seeded RNG (mulberry32) --------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// --- Small math helpers ---------------------------------------------------
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
// Shortest signed angle from `from` to `to`, in (-PI, PI].
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}
// Heading convention: heading 0 faces +Z, heading PI faces -Z (north).
// Forward vector for a heading: (sin h, cos h) in (x, z).
export function headingVec(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}

// --- Mission script -------------------------------------------------------
// Story order: pickup, delivery, drops, heat, tail, score — then the
// repeatable courier run. Targets are snapped to the nearest road by the
// mission manager so a marker never lands inside a building.
export const MISSION_DEFS = [
  {
    id: 'pickup',
    title: 'First Pickup',
    text: 'Reach the docks — Mama Lou is waiting on that package.',
    type: 'reach',
    target: { x: -210, z: 240 },
    reward: 150,
  },
  {
    id: 'delivery',
    title: 'Hot Delivery',
    text: 'Deliver the package across town. The cops are already looking.',
    type: 'timed',
    target: { x: 210, z: -210 },
    time: 150,
    startWanted: 2,
    reward: 300,
  },
  {
    id: 'drops',
    title: 'Three Drops',
    text: 'Collect the 3 cash cases stashed around the city.',
    type: 'drops',
    targets: [
      { x: -180, z: -180 },
      { x: 180, z: 180 },
      { x: 0, z: -210 },
    ],
    reward: 400,
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    text: 'Three stars on your head. Shake the cops until the heat is gone.',
    type: 'heat',
    startWanted: 3,
    reward: 250,
  },
  {
    id: 'tail',
    title: 'Tail the Courier',
    text: 'Follow the gold car. Stay close — but if he spots you, it is over.',
    type: 'tail',
    tailTime: 20, // seconds inside tail range to complete
    tailDist: 25, // inside this range counts as tailing
    loseDist: 35, // past this range the tail is slipping
    loseTime: 5, // seconds past loseDist before the tail fails
    reward: 350,
  },
  {
    id: 'score',
    title: 'The Big Score',
    text: 'Hold E at the bank to grab the loot, then reach the hideout.',
    type: 'score',
    bank: { x: 0, z: -60 },
    hideout: { x: -180, z: 180 },
    time: 240,
    grabWanted: 3,
    reward: 800,
  },
  {
    id: 'courier',
    title: 'Courier Run',
    text: 'Drop the parcels at every stop before the clock runs out.',
    type: 'courier',
    stops: 3,
    time: 120,
    reward: 100,
  },
];

export const STORY_COUNT = 6; // first six defs are the story arc

export const RESPAWN = {
  clinic: { x: 30, z: 270 },
  precinct: { x: 0, z: -270 },
};
