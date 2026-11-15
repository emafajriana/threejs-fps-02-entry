[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/emafajriana/threejs-fps-02-entry/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/emafajriana/threejs-fps-02-entry/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# KESTREL FOUNDRY

A round-based tactical FPS in the browser, built for threejs-fps-02.

Two crews fight over a decommissioned smelter at dusk. The **Jackals**
(attack, amber) carry a demolition Charge and win a round by planting it
at the Furnace (Site A) or the Depot (Site B) and letting it blow — or by
wiping the defence. The **Wardens** (defence, teal) win by holding the
sites until the clock dies, defusing a planted Charge, or wiping the
attack. You play the Jackals' point runner. First crew to 6 rounds takes
the match.

## How a round flows

1. **Buy phase (12s).** Everyone starts a match on $800 with the P9
   sidearm. Press **B**, buy with **2–5**: Rook SMG $1,500, Kestrel rifle
   $2,700, Longbow DMR $3,200, Kevlar vest $650.
2. **Live round (100s).** Bots push, escort, hold and rotate on a
   waypoint graph with line-of-sight perception. Accuracy beats speed:
   every gun's spread blooms when you move or hold the trigger, and
   settles when you plant your feet.
3. **The Charge.** You start each round carrying it. Stand in a site and
   hold **E** for 3.2s to plant; it blows in 35s unless a Warden channels
   a 5s defuse. Die and it drops where you fell — a teammate can pick it
   up, and so can you next life. Dropped rifles can be picked up too.
4. **Economy.** Kill +$300, round win +$2,500, loss +$1,400, plant bonus
   +$300. Survivors keep their gear; the dead restart on the P9.

## Controls

WASD move · mouse aim · click fire · **R** reload · **1/2** sidearm /
primary · **E** plant · **B** buy menu · **Tab** scoreboard · right-click
aims the Longbow's scope · Shift runs, Space hops.

## Tech

Static ES modules, no build step for the game itself: `game/index.html`
loads three.js 0.187.0 from `game/vendor/three/` behind an import map,
and the logic is split across `game/src/` — world geometry and the
waypoint graph (`world.js`), bots (`bots.js`), weapons (`weapons.js`),
HUD (`hud.js`), synthesized WebAudio gunfire and foley (`audio.js`), and
the match director (`main.js`). All textures are procedural canvas work;
all sounds are synthesized — no external assets.

`main.ts` (Node 22) copies `game/` and `screenshots/` into the output
directory and writes the dossier manifest via `vendor/makefun-threejs.ts`.

Screenshot staging: open `game/index.html?shot=start|play|end` for the
three composed frames used in `screenshots/`.

MIT licensed — see `LICENSE`.
