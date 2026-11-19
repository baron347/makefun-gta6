// NEON HARBOR — shared constants, mission script, RNG and road helpers.
// Everything every other module needs lives here so the modules never
// disagree about the shape of the city or the shape of a job.

export const SAVE_KEY = 'neonharbor-save-v1';

// The city is a 9x9 block grid. Roads are the lines x = c and z = c for
// c in ROADS; blocks sit between neighbouring roads, set back by the
// sidewalk. The whole map runs from -HALF to +HALF on both axes.
export const CITY = {
  blocks: 9,
  pitch: 60,
  roadWidth: 14,
  sidewalk: 3,
  half: 300,
  lane: 3.5,
};

export const ROADS = [];
for (let i = 0; i <= CITY.blocks; i++) ROADS.push(-CITY.half + i * CITY.pitch);

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.5,
  jumpSpeed: 6.5,
  gravity: 18,
  health: 100,
  regen: 6,
  regenDelay: 10,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverse: 10,
  maxSpeed: 34,
  maxReverse: 10,
  maxSteer: 0.55,
  handbrakeTurn: 1.7,
};

export const WANTED = {
  max: 5,
  quietSeconds: 25,
  decayEvery: 8,
  copBustRange: 1.6,
  copBustSeconds: 1.5,
  ramDamage: 12,
  ramRange: 3.2,
};

export const TRAFFIC_COUNT = 32;
export const PARKED_COUNT = 14;
export const PED_COUNT = 24;

// Seeded RNG (mulberry32) so the city is identical for a given ?seed=.
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

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest signed difference between two headings, in (-PI, PI].
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function headingTo(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}

export function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function inBounds(x, z) {
  return Math.abs(x) <= CITY.half && Math.abs(z) <= CITY.half;
}

// Nearest point on the road network to (x, z). Roads are axis-aligned
// lines, so the nearest road point is the closest vertical or horizontal
// road line clamped to the map. `along` is the coordinate along the road.
export function nearestRoad(x, z) {
  let best = null;
  for (const c of ROADS) {
    const d = Math.abs(x - c);
    if (!best || d < best.d) best = { x: c, z: clamp(z, -CITY.half, CITY.half), along: 'z', d };
    const d2 = Math.abs(z - c);
    if (d2 < best.d) best = { x: clamp(x, -CITY.half, CITY.half), z: c, along: 'x', d: d2 };
  }
  return best;
}

export function snapToRoad(x, z) {
  const n = nearestRoad(x, z);
  return { x: n.x, z: n.z };
}

export function randomRoadPoint(rng) {
  const c = ROADS[Math.floor(rng() * ROADS.length)];
  const along = -CITY.half + rng() * CITY.half * 2;
  return rng() < 0.5 ? { x: c, z: along } : { x: along, z: c };
}

// ---------------------------------------------------------------- missions

// Story: Danny "Dash" Reyes owes Mama Lou. Six jobs, then courier runs.
// Targets are snapped to the nearest road when a job starts, so a marker
// never lands inside a building.
export const MISSIONS = [
  {
    id: 'pickup',
    title: 'First Pickup',
    type: 'pickup',
    intro: 'Pick up the package at the docks.',
    target: [-210, 240],
    reward: 150,
  },
  {
    id: 'delivery',
    title: 'Hot Delivery',
    type: 'delivery',
    intro: 'Deliver the goods across town. The heat is on — 2 stars from the start.',
    target: [210, -210],
    reward: 300,
    time: 150,
    startWanted: 2,
  },
  {
    id: 'drops',
    title: 'Three Drops',
    type: 'drops',
    intro: 'Drop the cash cases at three spots.',
    targets: [[-180, -180], [180, 180], [0, -210]],
    reward: 400,
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    type: 'heat',
    intro: '3 stars on your tail. Lose them all to finish the job.',
    startWanted: 3,
    reward: 250,
  },
  {
    id: 'tail',
    title: 'Tail the Courier',
    type: 'tail',
    intro: 'Follow the gold car — stay close, do not lose it.',
    reward: 350,
  },
  {
    id: 'score',
    title: 'The Big Score',
    type: 'score',
    intro: 'Hold E at the bank to grab the loot, then reach the hideout.',
    bank: [0, -60],
    hideout: [-180, 180],
    time: 240,
    reward: 800,
  },
];

export const COURIER = {
  id: 'courier',
  title: 'Courier Run',
  type: 'courier',
  intro: 'A courier run — reach the marker before the clock runs out.',
  time: 120,
  reward: 100,
};

export const STORY = {
  hero: 'Danny "Dash" Reyes',
  boss: 'Mama Lou',
  blurb:
    'Sunset over Neon Harbor. You owe Mama Lou, and she collects. ' +
    'Steal cars, dodge the Harbor PD, run six jobs — and maybe walk away clean.',
};
