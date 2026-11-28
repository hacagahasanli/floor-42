# Handoff — PEWFIELD (ex Floor 42), state on 2026-11-28

Read this first after a cleared chat. Detail lives in `docs/collab/LOG.md`, `REQUESTS.md`, `FEEDBACK.md`.

## Where things are
- Main checkout: `~/Desktop/projects/games-studio/floor-42`, branch `portal-build`, last commit `51eacbf` (local only, nothing pushed).
- Rename branch: `rename-pewfield` in worktree `~/Desktop/projects/games-studio/floor-42-rename` (5 commits, rebased onto `2a8b766` on 2026-11-28: logo A, favicons, titles, water tower, README). **Not merged** — waits for Reis's trademark search.
- Online latency branch: `net-latency` in worktree `~/Desktop/projects/games-studio/floor-42-net` (snapshots every tick, compact wire format, real-time server tick, multi-region code off by default). Online is PARKED (no server spend) — see memory `floor42-online-parked`.
- CrazyGames: the first desktop build was handed over 2026-11-27 (zip from ab70691). Everything after is an UPDATE to ship only after the full test pass.

## What was done (2026-11-27/28)
- Perf: frame-time governor, offline step cap, WebGL-lost overlay, iOS audio resume.
- OFFSITE desert arena (default offline), office kept as "FLOOR 42" arena; data-driven arenas.
- Field Day UI (Direction B): `src/components/fieldday/` (README has the API), all screens incl. result showpiece with awards.
- New roster: BRIX (slot hotfix), ORMO (legacy), ZUZU (standup), TAVO (intern); internal ids unchanged; developer theme removed.
- Signature traits + per-fighter HP (offline only, `GameState.traits`), balanced 46-54 % on OFFSITE (`docs/collab/CREATIVE/characters/traits-balance.md`, `tools/balance/`).
- Trait feedback (callouts, VFX, sounds, HUD badge, max-HP bars), star icons removed (IP).
- Name PEWFIELD + logo A chosen (CD R-023); IP check done (ORMO/BRIX redesigned to avoid Wario / Roller Brawl likeness).

## Colour balance status (2026-11-28 midday)
- R-027 spec done; F-056 implemented on portal-build `11b6915`, F-057 (bigger wordmark) on rename-pewfield `3a4a61d` (rename rebased on F-056). Captures `docs/collab/shots/colour-balance/impl/`.
- R-028 open with the CD: Settings has 4 sun marks, cooling HUD chip text contrast 2.42:1, wordmark/ribbon tuck, deviation review. Apply its F-items next, then the full test pass.

## In flight when the chat was cleared (historical)
- **R-027 colour balance** (Creative Director; first run died with the chat clear after the BEFORE captures, restarted 2026-11-28 10:03): Reis said it is nice but "too many colours, balance lost, messy". Spec will land in `docs/collab/CREATIVE/ui/direction-b/colour-balance.md`; then one engineer applies it (both `portal-build` and the rename branch, or merge rename first). Also judge: PEWFIELD wordmark on home is too small (~272x118).

## Waiting on Reis
1. Manual trademark search for PEWFIELD (+ BRIX, ZUZU): USPTO tmsearch.uspto.gov, EUIPO eSearch + TMview, WIPO branddb (classes 9, 28, 41); open serials 86532387, 87322281, 98774422, reg 4893686; Google Lens/TinEye on `docs/collab/CREATIVE/brand/png/a-icon-512.png`. Clean -> merge `rename-pewfield`. Problem -> backup name Duelfield.
2. CD to approve the engineer-written title suffix "— 1v1 shootout" and meta description.

## Next, in order
1. Apply R-027 colour balance; merge rename when cleared; bigger wordmark.
2. Full high-level test pass before CrazyGames (backlog item, profile `floor-42`): release QA, playtest critic, QA engineer, accessibility, perf on weak hardware, ip-guard re-check (ORMO/BRIX revised, logo), kill-committee; ideally 3-5 humans.
3. CrazyGames update: new zip, new covers/videos (old ones show the office + old fighters), description/controls text, title "Pewfield".
4. Studio site + subdomain rename (backlog), only with Reis's OK.
5. Backlog: two new arenas after this ships.

## Open F-items worth knowing
- KING OF THE HILL award: needs CD copy, icon and a definition of "one platform" per arena before engineering can track it (raise as an R- item after R-027).
- F-054 partially done; result screen: KING OF THE HILL award not tracked; old docs images (demo.gif, home.png, characters.png) still old.
- Office arena: ZUZU 55-56 % (slightly over the band).
- Wall-splat `sinceHit` bug: fixed in `2a8b766` (test + balance re-run, no shift).

## Rules that bit us
- `docs/collab/CREATIVE/` belongs to the Creative Director; engineering never edits it.
- agents-know guard hook: verifier agents (ip-guard, perf) cannot write outside their run dir; don't write their reports for them.
- Codex login expired: run `codex logout && codex login` to use Codex as CD again.
- Chrome extension was not connected all session (Upwork scan moved to `~/Desktop/projects/upwork/`, run from another chat).
