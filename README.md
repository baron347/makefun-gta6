# NEON HARBOR — an open-world three.js crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/baron347/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/baron347/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Steal a car. Outrun the cops. Run the jobs. Own the harbor.**

NEON HARBOR is an open-world crime game in the browser — a 9×9-block sunset
city you explore on foot and by car, with 32 traffic cars and 14 parked,
a 5-star wanted system with police chases, roadblocks and a police
helicopter, 6 story missions plus multi-stop courier jobs, a pistol,
a full HUD with a local-zoom minimap, menu / pause / busted / wasted
states, localStorage saves, and WebAudio sound. Static files, no network,
no account.

![Cover — a police chase through the harbor](screenshots/1-cover.jpg)

## What you do

- **Drive the city.** Take any car on the street — traffic keeps moving,
  parked cars wait at the curb, and the city is yours to cross. Traffic
  mixes sedans, yellow taxis, vans and sports cars, each with its own
  speed.
- **Earn your wanted stars.** Steal cars and cause trouble and the police
  come for you: cruisers chase, roadblocks form across the road at 3
  stars and up, and a police helicopter with a spotlight orbits you at
  4 stars and up. Lose them, or get busted.
- **Run the jobs.** 6 story missions plus multi-stop courier work — a
  pickup, a timed delivery, three drops, losing the heat, tailing a
  gold car, and the big score. Each job pays, raises the heat, and
  pushes the story forward.
- **Stay alive.** A pistol, a health system, and a HUD that tells the
  truth: wanted level, local-zoom minimap, mission timer, and cash on hand.

## Run it

No build step, no network. Any static server works:

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome.

## How it is built

- `game/` — plain static files, ES modules, no build step. three.js r160
  is vendored under `game/vendor/three.min.js`.
- `game/src/` — the game: city (`city.js`, neon billboards, lit
  storefronts, traffic lights), vehicles (`vehicles.js`, traffic
  variants, police, roadblocks, helicopter, crash smoke), pedestrians
  (`peds.js`), player (`player.js`), missions (`missions.js`), HUD with
  local-zoom minimap (`hud.js`), audio (`audio.js`, two bassline
  patterns, intensity rises with the wanted level), screenshot staging
  (`shots.js`), and the entry point (`main.js`).
- `main.ts` — the hand-in program (Node 22 stdlib only): copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json` with the
  vendored make.fun library.
- `serve.ts` — a tiny static server for local play.

## Screenshots

`screenshots/` holds four renders of the game itself: a police chase, a
street cruise, a mission, and a shootout. The first file by name is the cover.

---

<sub>Entered on [make.fun](https://make.fun/?ref=na41kg1z&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
