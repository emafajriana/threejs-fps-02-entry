// KESTREL FOUNDRY — a round-based tactical FPS for threejs-fps-02.
//
// Build step: gather the static browser game (game/) and the staged
// screenshots (screenshots/) into the output folder, then describe them
// with the dossier manifest the judges read. The game itself is plain
// ES modules plus the kit's pinned three.js build; there is nothing to
// compile, so this step is a careful copy plus the manifest.
//
// Two grader-runtime details matter here:
// - Input paths resolve from this file's own directory, never from
//   process.cwd(): the grader's container cwd is not the entry dir.
// - buildDossier RETURNS the dossier bytes; they are written to
//   dossier.json explicitly, because the scorer reads that file.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(OUT, { recursive: true });

for (const part of ["game", "screenshots"]) {
  const from = join(here, part);
  if (!existsSync(from)) throw new Error(`missing ${part}/ — the entry is incomplete`);
  cpSync(from, join(OUT, part), { recursive: true });
}

writeFileSync(
  join(OUT, "dossier.json"),
  buildDossier(OUT, {
    text_max_bytes: 163_840,
    screenshots: { max: 4, max_bytes: 262_144 },
    game_max_files: 993,
    game_max_bytes: 50_331_648,
  }),
);

console.log(`dossier written to ${OUT}`);
