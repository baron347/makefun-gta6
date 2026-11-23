# NEON HARBOR — Open World Crime

A three.js open-world crime game that runs offline from static files in a
desktop browser. Sunset City, 6:47 PM: steal cars, outrun the law, run jobs
for Mama Lou, and don't get caught.

## The game

**City.** A procedural 9×9-block city (60 m pitch, roads at every 60 m from
-300 to 300) with a canvas-textured ground plane — asphalt, sidewalks,
centre dashes, crosswalks — buildings with lit-window facades (taller
downtown, up to ~68 m), 7 parks, palms along the central avenue,
streetlights, neon billboards downtown, and a violet-to-orange gradient
sky dome with fog and a low sun.

**On foot & by car.** Walk, run, jump (WASD + Shift + Space, mouse to look,
pointer lock with drag fallback). Steal any parked car — or a stopped
traffic car — with E and drive it with arcade handling (handbrake on
Space). 32 traffic cars in 5 variants (sedan, taxi, van, truck, sport)
follow the road grid, slow for the car ahead, and turn at intersections;
14 parked cars wait along the curbs.

**Wanted.** Stealing a car, running a pedestrian over, or shooting one
each add a star (max 5). At wanted 1–5, up to 6 police cruisers chase you
(faster and more aggressive as the stars climb); cruisers ram and damage
you. At wanted 3+, cruisers set up roadblocks across the road ahead. At
wanted 4+, a police helicopter orbits overhead with a spotlight. On foot,
officers get out and chase you — one that stays within arm's reach for
1.5 s busts you (fine + respawn at the precinct). Stay quiet and out of
sight and the heat cools off, one star at a time. Health regenerates
after 10 s without damage; at zero health you wake up at the clinic
minus 15% of your cash.

**Missions.** Danny "Dash" Reyes owes Mama Lou. Six story jobs, then
repeatable courier runs (N to start the next job):

1. First Pickup — reach the docks ($150)
2. Hot Delivery — cross town in 150 s, starting at 2★ ($300)
3. Three Drops — collect 3 cash cases ($400)
4. Lose the Heat — start at 3★, finish when the wanted level hits 0 ($250)
5. Tail the Courier — follow the gold car for 20 s without losing it ($350)
6. The Big Score — hold E at the bank to grab the loot (3★), then reach
   the hideout in 240 s ($800)
7. Courier Run — 3 random stops in 120 s, repeatable ($100)

A gold beam, a spinning diamond, and a ground ring mark the objective;
an edge arrow points at it when it is off-screen.

**Combat.** Click to fire the pistol (on foot). Shots knock pedestrians
down, scare the crowd, and add a star. A tracer beam and muzzle flash
mark each shot.

**HUD.** Cash, health bar, 5 wanted stars, mission title/objective/timer,
speedometer, crosshair, damage vignette, and a circular local-zoom
minimap (streets around you, mission marker, traffic dots, flashing
police) with a player arrow. Menu, pause (P/Esc, with save), BUSTED and
WASTED screens. Progress autosaves on every completed job and can be
saved from the pause menu (localStorage).

**Sound.** Everything is synthesized with WebAudio — no audio files:
engine hum that follows your speed, a wailing siren while wanted,
gunshots, impacts, pickup blips, mission jingles, a fail sting, and a
lazy Am–F–C–G bassline loop that gets busier (and switches pattern) when
the heat is on. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Look (click to lock the pointer) |
| E | Steal / exit car; hold at the bank to grab the loot |
| Click | Shoot (on foot) |
| Shift | Run |
| Space | Jump on foot, handbrake while driving |
| N | Start the next job |
| P / Esc | Pause |
| M | Mute |

## Screenshots

Rendered deterministically in headless Chrome with `?shot=…&seed=7`:

| File | Scene |
| --- | --- |
| `1-chase.jpg` | `?shot=cover` — red getaway car at 122 km/h, 3★ chase |
| `2-street.jpg` | `?shot=street` — walking the downtown avenue among traffic and pedestrians |
| `3-mission.jpg` | `?shot=mission` — Hot Delivery in the gold car, marker beam ahead |
| `4-shootout.jpg` | `?shot=chase` — 5★ shootout, tracer fire, cruisers closing in |

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Build the submission bundle (Node 22, standard library only):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored `vendor/makefun-game.ts`.

## Tech

- three.js r160, vendored as `game/vendor/three.min.js` (UMD classic
  script, no network at runtime)
- ES modules under `game/src/`, no dependencies, no build step
- Seeded RNG (`mulberry32`, default seed 7 via `?seed=`) so the city,
  traffic, and screenshots are deterministic
- Static files only: zero network requests while playing

## License

MIT — see `LICENSE`.
