/** Zips dist/portal into dist/pewfield-crazygames.zip with index.html at the root (what CrazyGames asks for). */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(new URL('../dist', import.meta.url).pathname);
const zip = resolve(dist, 'pewfield-crazygames.zip');
if (!existsSync(resolve(dist, 'portal/index.html'))) throw new Error('dist/portal/index.html is missing: build first');
if (existsSync(zip)) unlinkSync(zip);
// -X: no extra file attributes; -r: recurse; run inside dist/portal so index.html sits at the zip's root.
execFileSync('zip', ['-X', '-r', '-q', zip, '.'], { cwd: resolve(dist, 'portal') });
console.log(`Zip: ${zip} (${(statSync(zip).size / 1024 / 1024).toFixed(2)} MB)`);
