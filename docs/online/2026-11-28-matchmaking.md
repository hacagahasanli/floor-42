# Online matchmaking with a server bot: design, measurements, cost, deploy (2026-11-28)

Branch `online-bots` (from `portal-build` + `net-latency` merged). Local only: nothing pushed, nothing deployed.
Owner decisions: online comes back; quick match never leaves a player waiting; latency comes first.

## 0. Update, same day: the bot runs in the browser; human pairs on the unreliable direct line

The owner's top priority is minimum felt latency. Two changes followed (commit `f251b2a` and after).

**Problems first**

1. **Item 2 needed no transport change, and that is the finding.** The browser-to-browser path already used an
   unordered `game` channel with `maxRetransmits: 0`, already resent the last 8 inputs in every packet and already
   kept a reliable `ctl` channel (`peer.ts`, `client.ts`). Every quick-match or invite pair tries it first. The table
   below compares that path against WebSocket server mode, where packet loss blocks the line.
   - The "after" column shows what human pairs get **when the direct line forms**.
   - Where it does not form (strict NAT), the match falls back to the WebSocket server path, the "before" column.
2. **Server-side WebRTC on Fly is not built.**
   - Fly UDP needs a dedicated IPv4 ($2/month per app). The app must bind the `fly-global-services` address on the
     same single port used externally. Fly has "no per-flow load balancing for UDP", says "Don't assume a particular
     MTU" (https://docs.fly.io/networking/udp-and-tcp), and its docs do not mention WebRTC.
   - This means a native WebRTC stack in the server (e.g. node-datachannel), an ICE-lite single-port setup, and
     testing on Fly, which we cannot do without deploying. [Estimate: 2-4 days.]
   - **Recommended instead: a TURN relay over UDP for strict-NAT pairs.** `peer.ts` already supports TURN
     (`NEXT_PUBLIC_TURN_URL`, link mode `turn`), and a TURN relay keeps the unreliable channel. Cloudflare TURN costs
     "$0.05/real-time GB outbound" and serves UDP on 3478/443 (https://developers.cloudflare.com/realtime/turn/).
   - Blocker before using it: today's TURN credentials are static public env vars. Cloudflare needs short-lived
     credentials, which the game server should mint from a Fly secret. Not built.
3. **Direct play is asymmetric.** The inviter's browser runs the game, so the host sees the guest's turn in 33-83 ms
   while the guest sees the host in 33-100 ms, and the host's hits are judged locally. This was already true; it is
   now worth a playtest question.
4. **The offer banner overlaps the result title** at 1280x720 (`shots/standby-1-offer.png`). It is placeholder UI,
   added to R-032 for the Creative Director.
5. **Direct-line timeline underruns stay high at exactly RTT 100 ms** (61-119 per 2 min, vs 8-24 at 150 ms). Not
   explained; the latency percentiles at that point are fine.
6. **Small corrections in a constant firefight are not reduced** by the direct line (each hit's knockback still
   comes from the authority). Visible snaps over 50 cm drop sharply.

**Browser bot (item 1): built, default on.**
- At the bot step (8.5 s after pressing Quick match, `MATCH_TIMING.BOT_DUE_MS`) the browser starts a local match
  against the same `createBot` with zero network: OFFSITE, no traits (like online), label `BOT · NORMAL`.
- The player stays on **standby** in the quick-match room. The server records `busy` while a round is on and
  `available` on the result screen.
- A human who joins the room starts nothing. If both players are available and this player has not accepted, the
  server sends `offer`, and the result screen shows "A player is free · FIGHT THEM". Accepting starts the human
  match (direct-line handshake). Next match only; there is no swap mid-match.
- If the server cannot be reached at all, the player still gets the browser bot, with no standby.
- The server bot stays behind `NEXT_PUBLIC_SERVER_BOT=1`.
- Analytics: rounds report mode `online_bot`. Checked with a local capture endpoint: `round_start` and `round_end`
  arrive with `"mode":"online_bot"`.

Evidence (real-GPU Chromium, `tools/netlab/online-e2e-localbot.mjs`, `data/e2e-localbot.json`, `shots/localbot-*`,
`shots/standby-*`):
- Lone player: in the bot match 9.0 s after pressing Quick match. `__mc.net()` is false (no network in the match;
  only the idle standby socket stays open). Arena `offsite`, traits off, HUD `YOU` vs `BOT · NORMAL`.
- Full match (first to 5) to the result: 4-5 after 42 s of fight. REMATCH restarted in 176 ms, still `BOT · NORMAL`.
- Standby: A finishes a bot match, then B presses Quick match. A sees the offer 112 ms later; B is not in a match
  yet. A clicks Fight them, and both are in a human match (`RIVAL`, direct line) 0.8 s after B's press.
- Server tests: the offer only appears on a result screen, it is withdrawn when the other player starts a bot match,
  and `busy` is refused once a human match is starting (`duelRoom.server.test.ts`, 8 tests).
- vitest 45 files, 782 tests pass (5 new for the browser-bot plan and standby). tsc clean.

**Input → rival screen, before vs after** (`tools/netlab/sim.mts` = server mode over WebSocket/TCP;
`tools/netlab/simdirect.mts` = direct line, unordered, `maxRetransmits: 0`). 120 s per cell, jitter 10 ms, OFFSITE,
the real session, authority and timeline code.
- RTT is player↔server for "before" and browser↔browser for "after". For two players in the same region the direct
  RTT is at most the sum of their two one-way trips to the server, so the comparison does not flatter "after".
- The values include the fighter's own acceleration: about 33 ms even at RTT 0.
- Bot matches now skip this table: they are local, so 0 ms network and no corrections.

| players | RTT | loss | BEFORE server/TCP rival p50 / p95 | AFTER direct/unreliable p50 / p95 | after: guest sees host · host sees guest | before corr >5cm / >50cm per min | after corr | before underruns /2 min | after |
|---|---|---|---|---|---|---|---|---|---|
| move | 20 | 0% | 67 / 167 | 33.5 / 150 | 50/200 · 33.5/133.5 | 0.5 / 0.51 | 0.3 / 0.26 | 0 | 0 |
| move | 50 | 0% | 100 / 183.5 | 50 / 150 | 67/150 · 50/83.5 | 1 / 0.51 | 0 / 0 | 2 | 0 |
| move | 100 | 0% | 150 / 233.5 | 83.5 / 183.5 | 83.5/217 · 67/100.5 | 1.5 / 0.51 | 0 / 0 | 1 | 0 |
| move | 150 | 0% | 183.5 / 233.5 | 100 / 200 | 100/217 · 83.5/100 | 2.1 / 0.51 | 0.3 / 0.26 | 1 | 0 |
| move | 20 | 1% | 117 / 250 | 33.5 / 150 | 33.5/200 · 33.5/133.5 | 6.7 / 1.03 | 0.3 / 0.26 | 64 | 24 |
| move | 50 | 1% | 133.5 / 267 | 50 / 167 | 50/217 · 50/133.5 | 9 / 0.77 | 0.3 / 0.26 | 68 | 13 |
| move | 100 | 1% | 183.5 / 317 | 83.5 / 183.5 | 83.5/217 · 67/150 | 12.1 / 0.77 | 0 / 0 | 64 | 61 |
| move | 150 | 1% | 200 / 383.5 | 100 / 217 | 100/267 · 83.5/133.5 | 29.5 / 1.79 | 0.3 / 0.26 | 65 | 12 |
| move | 20 | 2% | 133.5 / 300 | 50 / 150 | 50/183.5 · 33.5/133.5 | 15.6 / 1.79 | 0 / 0 | 122 | 41 |
| move | 50 | 2% | 150 / 317 | 50 / 167 | 50/217 · 50/133.5 | 21 / 2.05 | 0.3 / 0.26 | 122 | 17 |
| move | 100 | 2% | 200 / 367 | 83.5 / 183.5 | 83.5/183.5 · 67/150 | 29.7 / 2.82 | 0.3 / 0.26 | 121 | 119 |
| move | 150 | 2% | 217 / 483.5 | 100 / 217 | 100/267 · 83.5/133.5 | 60.5 / 5.38 | 0.3 / 0.26 | 121 | 23 |
| fight | 20 | 0% | 100 / 217 | 33.5 / 150 | 33.5/150 · 33.5/133.5 | 655.6 / 1.28 | 0.8 / 0.77 | 0 | 0 |
| fight | 50 | 0% | 117 / 233.5 | 50 / 150 | 50/167 · 33.5/83.5 | 484.9 / 3.85 | 0.8 / 0.77 | 2 | 0 |
| fight | 100 | 0% | 167 / 317 | 83.5 / 183.5 | 83.5/183.5 · 67/100.5 | 351.5 / 13.33 | 5.4 / 2.05 | 1 | 0 |
| fight | 150 | 0% | 200 / 317 | 100 / 200 | 100/217 · 83.5/150 | 305.9 / 15.9 | 91.8 / 4.36 | 1 | 0 |
| fight | 20 | 1% | 117 / 266.5 | 50 / 200 | 50/200 · 33.5/183.5 | 449 / 4.36 | 524.4 / 0.77 | 64 | 20 |
| fight | 50 | 1% | 133.5 / 300 | 50 / 167 | 50/167 · 67/167 | 419.2 / 8.72 | 519.7 / 2.82 | 68 | 11 |
| fight | 100 | 1% | 150 / 350 | 83.5 / 183.5 | 83.5/183.5 · 100/267 | 99.7 / 7.69 | 65.1 / 3.59 | 64 | 69 |
| fight | 150 | 1% | 200 / 400 | 100 / 217 | 100.5/267 · 83.5/100 | 94.9 / 6.67 | 2.1 / 0.26 | 65 | 8 |
| fight | 20 | 2% | 133.5 / 333.5 | 33.5 / 150 | 33.5/200 · 50/133.5 | 334.9 / 7.95 | 1 / 0.77 | 122 | 46 |
| fight | 50 | 2% | 150 / 333.5 | 50 / 183.5 | 50/217 · 67/133.5 | 258.2 / 8.97 | 136.7 / 1.28 | 122 | 24 |
| fight | 100 | 2% | 200 / 400 | 83.5 / 267 | 83.5/183.5 · 67/700 | 163.6 / 11.54 | 99.2 / 2.56 | 121 | 117 |
| fight | 150 | 2% | 233.5 / 483.5 | 100 / 200 | 100.5/217 · 83.5/133.5 | 125.9 / 11.28 | 65.9 / 2.31 | 121 | 24 |


How to read it:
- **No loss**: the direct line roughly halves the rival delay (one one-way trip, no server hop): p50 33-100 ms vs
  67-200 ms.
- **1-2 % loss**: the server path's median grows by 33-67 ms and its p95 by up to 250 ms. The direct line's median
  moves by 0-17 ms.
- **Visible snaps (> 50 cm)**: 0.5-16 per minute before, 0-4.4 after.

## 1. Problems first

1. **Packet loss, not our code, is the biggest source of lag.** WebSocket is TCP: one lost packet holds back every
   later snapshot until it is resent (head-of-line blocking, at least ~200 ms). With no loss, the rival's turn shows
   on your screen 50 ms (RTT 20) to 84 ms (RTT 50) after it was pressed. With 1 % loss and 10 ms jitter it takes
   117-134 ms at the median and 250-350 ms at p95 (section 6). Prediction, buffer and rewind do not fix this. Only an
   unreliable transport fixes it (WebRTC data channel to the server, or WebTransport). That is a larger project
   (section 9).
2. **A Fly `shared-cpu-1x` may be too small for a busy room.** Its baseline is 6.25 % of a core, with burst credit
   (docs.fly.io/machines/cpu-performance). Locally, one running room costs 7-8 % of an Apple M1 Pro core and ten rooms
   cost 11-14 % in total (section 7). One room is therefore already above the baseline on a faster CPU. Matches
   should still run on burst credit (5 s at start, up to 500 s banked), but a busy hour could throttle the tick. This
   was **not measured on Fly**. Measure it first after deploy (section 10, step 5). If it throttles, the cheap fix is
   one process-wide ticker for all rooms instead of one timer per room.
3. **With fra + iad and the +60 ms cap, the cross-region step almost never fires.** Paris to iad is about 106 ms and
   New York to fra about 86 ms (section 5). Both are more than 60 ms worse than the home region, so in practice the
   flow is: wait in your own region, then get a bot. This follows the owner's latency-first rule (a laggy human loses
   to a local bot). Players only meet across regions if the cap is raised (`FALLBACK_RTT_CAP_MS`).
4. **A human pair can wait up to 6 s after "Rival found".** The server first tries a direct WebRTC line between the
   two browsers (from net-latency) and starts in server mode only if that fails or after 6 s. Locally the direct line
   formed and the match started 2.1 s after pressing. Against a client that cannot do WebRTC it took 4.6 s more.
   Strict mobile NATs will hit the 6 s path.
5. **The online screens are still placeholders.** These are: the dark developer-theme lobby, search-status copy
   written by engineering, an old loading screen with office tips (online now plays OFFSITE), and the unstyled ping
   badge. All are filed as **R-032** for the Creative Director, and no look was invented. The CD turn was not run
   (left to the coordinator / Reis).
6. *(Resolved in section 0: bot matches now run in the browser by default.)* **Bot matches would feel better client-side** (section 8). The server bot works and is honest, but it carries the
   network delay.
7. **Docker image not built locally.** `docker build` stopped at a macOS keychain prompt (the credential helper,
   needed to pull `node:20-alpine`). Instead, I ran the server from a folder that holds only the files the
   Dockerfile copies: it started, answered `/ping` and ran a bot room. The real image build happens on Fly's remote
   builder at deploy time.

## 2. What works (evidence)

| Check | Result | Evidence |
|---|---|---|
| (b) Lone human gets a bot in ≤ 10 s | 8.9-9.0 s from pressing Quick match to in-match, in 4 runs; HUD `YOU` vs `BOT · NORMAL` | `shots/bot-1-searching.png`, `shots/bot-2-hud-label.png`, `data/e2e-all.json` |
| (b) Full match vs the server bot | First to 5 (no test hook), 4-5, result screen "ZUZU WINS!", 37 s of fight | `shots/bot-3-full-match-result.png`, `data/e2e-bot-full.json` |
| (d) Rematch vs bot | Starts ~50 ms after REMATCH (no "rival deciding"), still `BOT · NORMAL` | `shots/bot-4-rematch.png` |
| (a) Two humans meet | Matched in 2.1-2.4 s, both HUDs show `RIVAL` (never BOT), both saw the same winner, direct line, ping 4-8 ms | `shots/pair-rival.png`, `data/e2e-all.json` |
| (d) Rematch, two humans | A asks, stays on the result screen (`over`) until B asks, then both restart | `shots/pair-rematch.png` |
| (c) Invite link | Invite room still waiting after 10 s (no bot), guest opens the link and is in the match in 0.7-0.8 s | `shots/invite-guest.png` |
| Region fallback (two local servers as fra/iad) | Lone player: fra at 0.3 s, iad at 4.3 s, back to fra with the bot at 7.3 s, in the match at 9.0 s. Human waiting in iad: found by the iad leg at 4.3 s | `tools/netlab/online-regions.mjs` run |
| Human arrives during a bot match | Gets a new room and waits (next match); a link to the bot room is refused (locked); the bot match keeps running | `src/game/net/duelRoom.server.test.ts` |
| Unit tests | tsc clean; vitest 45 files, 775 tests pass (new: 18 matchmaking incl. timeouts → bot, fallback order and latency cap, cold-probe timing; 6 real-server room tests; wire arena; regions median) | `npx vitest run` |

Browsers: Chromium 1255 with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (ANGLE Metal, Apple M1 Pro),
1280x720, against `npm run server`-equivalent on :2567 (`KOS_TO_WIN=1` for the short matches) and Next dev
(`NEXT_PUBLIC_ONLINE=1`). No page errors in the runs.

## 3. Design

```
ONLINE -> Quick match pressed (t = 0)
  probe every region's /ping: warm-up (<= 6 s, wakes a stopped Fly machine) + median of 4   [only if > 1 region]
  home = lowest RTT; next = second lowest, only if RTT <= home + 60 ms
  leg 1 home      joinOrCreate, wait until t = 4.0 s for a human         (multi-region only)
  leg 2 next      joinOrCreate, wait until t = 7.0 s                     (only if next exists)
  leg 3 home      joinOrCreate with bot = 8.5 s - t (min 0.4 s): the server seats its bot if no human came
  one region (today): leg 3 only, bot = 8.5 s
```

- Code: `src/game/net/matchmaking.ts` has the plan (pure) and the runner (network and clock injected). The lobby
  wires it up in `OnlineLobby.tsx`. Region config is `gameRegions()` in `client.ts`.
- **Timings are constants** in `MATCH_TIMING`: `HOME_WAIT_MS 4000`, `FALLBACK_WAIT_MS 3000`, `BOT_DUE_MS 8500`
  (counted from the press, probes included), `MIN_BOT_WAIT_MS 400`, `MAX_BOT_WAIT_MS 20000` (the server clamps what a
  client asks), `FALLBACK_RTT_CAP_MS 60`.
- **Server bot** (`server/DuelRoom.ts`): the same `createBot` as offline (`src/game/sim/bot.ts`). It runs once per
  server tick as a non-remote seat of the shared authority, so its inputs are recorded and a lag-compensation rewind
  replays them exactly. Level `normal` (env `BOT_LEVEL`), random fighter other than yours. Rules:
  - The bot sits down only if exactly one human is in the room and no seat is reserved for a joining human
    (`hasReachedMaxClients`).
  - The room locks first, so a later human never enters a bot match (no mid-match swap). If the bot wins the race
    against a join already on its way, that player is sent back to the search (code 4409).
  - Pause is instant (the bot agrees). Rematch is instant (the bot always wants one).
  - The room closes when its human leaves. Invite (private) rooms never get a bot.
- **Honest label**: `start.bot = {slot, level}`. The HUD uses the offline chip `BOT · NORMAL`, never `RIVAL`.
  Protocol 4 refuses older clients ("reload"), so an old page can never show a bot as a human.
- **Rules online = rules on both ends**: online rooms play **OFFSITE** (env `ONLINE_ARENA`, the default arena offline
  too). It travels in `start` and in the snapshot state (new optional wire column). **Traits stay offline-only**:
  online states never set `traits`.
- **Invites**: with more than one region, the invite link carries the region (`/play?room=ID&r=iad`). A room id alone
  does not say where the room is. CrazyGames documents the same `region` parameter for invite links.
- **ONLINE_ENABLED** now reads `NEXT_PUBLIC_ONLINE === '1'` (off by default). The test that pins it off on
  `portal-build` still passes. The portal build defines it as `undefined`, so the portal never offers online.

## 4. Feel: what the netcode does (owner priority, 2026-11-28)

| Ask | Status |
|---|---|
| Prediction of your own fighter, no input delay | Yes: your input is applied in the same 60 Hz tick it is read and drawn the next frame (`client.ts tick`). Measured below: input → own screen is the same as with no network (the rest is the fighter's acceleration) |
| Reconciliation | Yes: adopt the snapshot, replay unacknowledged inputs, ease the correction over ~90 ms |
| Rival interpolation, smallest stable buffer | Timeline with adaptive delay; settles at 40-42 ms (min 40) |
| Server lag compensation (rewind) | Yes, capped at 150 ms (9 ticks): `authority.ts`. Attacks of a late input start when they arrive (no bullet that hits before it was drawn) |
| 60 Hz sim and snapshots, compact | Yes (protocol 3/4): ~800-1060 B per snapshot, 46-63 KB/s per client. **Not deltas**: every snapshot is the full state in compact rows. Deltas would cut bandwidth, not latency |
| WebSocket without Nagle | Yes: the `ws` server calls `socket.setNoDelay()` on every socket (`node_modules/ws/lib/websocket.js:269`); browsers do not apply Nagle to WebSocket frames [Estimate] |
| No per-message JSON on the hot path | **Partly.** Inputs go as Colyseus msgpack arrays. A snapshot is JSON of number rows, encoded **once per tick per room** (not per client): 0.046 ms to encode and 0.072 ms to decode on M1 (benchmark of 3000 snapshots). That is 0.4 % of a frame. A binary format would save bytes, not felt latency, so it was not done |
| Region by measured ping | Yes: `/ping` warm-up then median of 4 per region; regions in parallel, samples one after another on the warm connection (parallel samples to one host open new TLS connections and time the handshakes, a deviation from "3-5 in parallel") |

## 5. Regions: expected round trip per player location [from WonderNetwork server-to-server pings; players add their own last mile]

| Players in | fra (Frankfurt) | iad (Ashburn/Washington) | Home with fra + iad | Better with |
|---|---|---|---|---|
| Baku | 65-75 night, 110-157 day; avg 153 | 230 | fra; no fallback (iad > +60) | nothing closer on Fly (no otp/waw/ist; nearest fra/ams/arn) |
| Western Europe (Paris/London/Amsterdam) | 10-17 | 75-107 | fra; no fallback | — |
| US East (New York) | 86 | 7.5 | iad; no fallback | — |
| US West (Los Angeles / San Francisco) | 141-158 | 60-71 | iad; fra not within +60 | lax/sjc [Estimate ~10 ms] |
| Brazil (São Paulo) | 200 | 113 | iad | gru [Estimate < 20 ms; Fly lists gru as "MPG only, no Gateway", check before relying on it] |
| India (Mumbai) | 158 | 214 | fra | sin (WonderNetwork shows 171 ms Singapore-Mumbai, which looks wrong; usual ~60 ms [Estimate]) |
| Singapore / SEA | 157 | 214 | fra | sin [Estimate < 10 ms] |

Sources: https://wondernetwork.com/pings/Baku/Frankfurt, https://wondernetwork.com/pings/Baku,
https://wondernetwork.com/pings/Frankfurt, https://wondernetwork.com/pings/Washington,
https://wondernetwork.com/pings/Singapore (fetched 2026-11-28). Fly regions: https://docs.fly.io/reference/regions.
These are datacentre-to-datacentre averages over one path. Baku to Frankfurt swings 65-157 ms over the day.

Adding a region is config only: `fly.<region>.toml` (copy `fly.iad.toml`, change `app`, `primary_region`, `REGION`),
deploy it, and add `id=wss://host` to `NEXT_PUBLIC_GAME_REGIONS`. Nothing in the code changes.

## 6. Measured latency (netlab, the real client/authority/timeline code on a virtual network)

`npx tsx tools/netlab/sim.mts --rtt R --jitter 10 --loss L --secs 60` (OFFSITE). Two scripted players run, jump and
dash; "fight" = they also shoot most of the time, "move" = no shooting. Input → own = from a direction press to your
own drawn fighter moving that way. Input → rival screen = from a press to the **other** player's screen drawing it.
Both include the fighter's acceleration (about 17-33 ms even with no network). Raw: `data/netlab-2026-11-28.txt`.

| RTT | loss | input → own p50 / p95 | input → rival p50 / p95 (move) | (fight) | corrections > 50 cm / min (move / fight) | underruns / min |
|---|---|---|---|---|---|---|
| 0 (baseline) | 0 | 0 / 117 | 33 / 150 | — | 1.6 / — | 0 |
| 20 | 0 | 0 / 117 | 50 / 167 | — | 1.6 | 0 |
| 50 | 0 | 0 / 117 | 84 / 184 | — | 1.6 | 1 |
| 20 | 1 % | 0 / 117 | 117 / 250 | 117 / 284 | 1.6 / 5.8 | 34 |
| 50 | 1 % | 0 / 117 | 134 / 267 | 134 / 350 | 1.1 / 7.9 | 38 |
| 100 | 1 % | 0 / 117 | 184 / 300 | 167 / 467 | 1.1 / 13.2 | 34 |
| 150 | 1 % | 0 / 117 | 200 / 384 | 200 / 434 | 2.6 / 11.6 | 35 |
| 20 | 2 % | 0 / 117 | 134 / 317 | 150 / 317 | 2.1 / 7.9 | 59 |
| 50 | 2 % | 0 / 117 | 150 / 334 | 151 / 334 | 2.1 / 7.9 | 59 |
| 100 | 2 % | 0 / 100 | 200 / 367 | 200 / 384 | 3.2 / 11.1 | 58 |
| 150 | 2 % | 0 / 100 | 234 / 450 | 250 / 467 | 7.4 / 16.3 | 58 |

- **Own input is network-free**: the p50/p95 equal the no-network baseline at every RTT. That means ~1 frame plus
  the fighter's own acceleration.
- **Corrections**: when not shooting, visible snaps (> 50 cm) happen 1-7 times a minute. In a constant firefight,
  small corrections (> 5 cm) happen 125-265 times a minute. Each hit's knockback is decided by the server and
  arrives late. They are eased over 90 ms, not snapped. Without shooting there are 3-60 a minute.
- **Rival in a real browser** (two Chromium, netshim TCP model, server mode, 40 s, 1 % loss, 10 ms jitter): frames
  steady at 16.7 ms. Snapshot gap p50 16 ms, p99 210-250 ms (loss). Rival drawn-vs-truth error p50 0.5 m at RTT 50
  and 1.0 m at RTT 150. Worst visible rival freeze 0.97 s at RTT 50 and 2.8 s at RTT 150 (an outlier, one client).
  At RTT 50, 5 of 14 guest deaths were "surprise" (HP ≥ 60 150 ms before the KO). Runs:
  `tools/netlab/run.mjs ... --quick` with `blockIce`, analysed by `short.mjs`.
- **Local RTT** (same machine): server mode 0-1 ms, direct line 2-11 ms. HUD badge `SERVER · 0 MS`.

## 7. Server cost per room (measured locally, Apple M1 Pro, Node 20)

| Rooms (each: 1 human + server bot, both playing) | CPU, % of one core | Snapshot size | Down per client |
|---|---|---|---|
| 0 (idle server) | 0.1 % | — | — |
| 1 | 6.7-8.8 % | 870-1060 B | 51-63 KB/s |
| 10 | 10.8-14.1 % total (1.1-1.4 % per room) | ~800 B | ~46 KB/s |
| 30 | 28 % total (0.9 % per room) | ~800 B | ~46 KB/s |

- Game work per tick: p50 0.15-0.5 ms, p99 0.5-6 ms (rewinds, GC). The tick holds 60.0 Hz with gap p99 18.5-20.5 ms.
- The first room's fixed cost is timer wake-ups. The tick poll was 2 ms in net-latency and is now 4 ms
  (`TICK_POLL_MS`): CPU went from 7.6 % to 6.7 % for one room and from 13 % to 10.8 % for ten. At 8 ms the jitter
  got worse (gap p99 27 ms), so it was not used.
- Memory: 44-90 MB RSS. 256 MB is enough.
- Bandwidth per hour of play: ~170-210 MB per connected client. A bot room has one client; a human room has two.
- Tool: `npx tsx tools/netlab/botload.mts ws://localhost:2567 <server pid> <rooms> <secs>`.

## 8. Should bot matches run fully in the browser instead? Done (section 0): browser bot is the default

| | Server bot (built) | Client bot (offline engine, online rules) |
|---|---|---|
| Your movement | instant (predicted) | instant |
| Bot's actions on your screen | RTT/2 + 40 ms buffer later (≈ 65 ms at fra from WE, ≈ 115 ms+ from Baku by day) | 0 |
| Your hits on the bot / its hits on you | decided by the server, corrections in fights (section 6) | exact, no corrections, hit-stop as offline |
| Packet loss | hitches (TCP) | none |
| Server CPU / egress | ~1 % core per room + ~200 MB/h | 0 |
| Works when the server is down or cold | no | yes |
| Honesty | `BOT · NORMAL` | same label; must not be counted as an online match anywhere |

The server bot makes a bot match feel exactly like a human match at the same RTT. That is consistent, but it is
worse than offline. At launch most "online" matches will probably be bot matches, so a client-side bot gives those
players zero latency and costs nothing. Cost of switching: the matchmaker would tell the client "no human" instead of
seating a bot, and the client would start the offline engine with `net: true`, OFFSITE, no traits and the same label.
About half a day [Estimate]. Reis decides. The server bot stays useful only if we later want spectating, server-side
stats or anti-cheat on bot matches.

## 9. Ways to cut latency further (not built)

1. **Unreliable transport**: this removes the loss hitches, which are the largest item. Options are a WebRTC data
   channel to the server (e.g. node-datachannel on Fly; UDP needs a dedicated IPv4 at $2/month per app, because
   "we don't support UDP over shared IPv4", docs.fly.io/networking/services) or WebTransport. 2-4 days [Estimate].
2. **Process-wide ticker**: one timer for all rooms. This lowers the fixed CPU cost (risk 2).
3. **Faster human start**: skip or shorten the 6 s WebRTC attempt in quick match (risk 4).
4. **Region where players are**: sin for India/SEA and lax/sjc for US West give the biggest RTT wins (section 5).

## 10. Cost per region per month (Fly.io, https://docs.fly.io/about/pricing, checked 2026-11-28)

- `shared-cpu-1x` 256 MB: **$2.19/month if running all month**, billed per second while running.
- Stopped machine: only the root filesystem, $0.15/GB/month. ~$0.03-0.05 for this image [Estimate, image ~200-300 MB].
- Egress: $0.02/GB North America and Europe; $0.04/GB Asia Pacific, Oceania, South America; $0.12/GB Africa, India.
- Shared IPv4 free (WebSocket rides the HTTP/TLS handler on 443; Fly's page does not say so explicitly, so test on
  deploy). Dedicated IPv4 $2/month, not needed.
- The pricing page mentions a Free plan with "$5 of usage every month" for personal organizations. Check what this
  account actually has; I could not.
- Autostop: with `auto_stop_machines = "stop"` and `min_machines_running = 0`, the proxy stops an idle machine
  "after several minutes". Starting it again takes "about 2 seconds or more"
  (https://docs.fly.io/launch/autostop-autostart). The `/ping` probe's 6 s warm-up absorbs this. The bot is still
  due 8.5 s after the press.

| Scenario (per region) | Machine | Egress | Total |
|---|---|---|---|
| Quiet: 1 h of play a day, machine up ~1.5 h/day incl. idle tail | 45 h × $2.19/720 h ≈ $0.14 | 30 h × 0.2 GB × $0.02 ≈ $0.12 | **≈ $0.3** [Estimate] |
| Busy: someone playing 8 h/day, 2 clients avg | ≈ $0.80 | 240 h × 0.4 GB × $0.02 ≈ $1.9 | **≈ $2.7** [Estimate] |
| Always on (machine never stops) | $2.19 | as used | **$2.2 + egress** |

With fra + iad: **about $0.6 to $5.5 a month**, in line with the owner's $2-6 [Estimate]. sin or gru egress costs
twice as much per GB. Only players pressing Quick match or Invite wake machines, because the probe runs on that
press and not on page load. Nothing else touches them: there is no health check on purpose, since a periodic check
could keep a machine awake. It was not checked whether Fly's internal checks count as traffic.

## 11. Deploy steps (for Reis, later; nothing here was run)

1. Read `fly.toml` (fra, app `floor42-game`) and `fly.iad.toml` (app `floor42-game-iad`).
2. `flyctl deploy --ha=false --remote-only` (fra, existing app). Then `flyctl apps create floor42-game-iad` and
   `flyctl deploy --config fly.iad.toml --ha=false --remote-only`. Check `flyctl status` and
   `flyctl status --config fly.iad.toml`: one machine each, in the right region. Check that
   `curl https://floor42-game.fly.dev/ping` returns `{"region":"fra"}`.
3. Protocol 4 refuses older pages. Deploy the site right after the server, or the live site's (hidden) online shows
   "reload".
4. Vercel env: `NEXT_PUBLIC_ONLINE=1`,
   `NEXT_PUBLIC_GAME_REGIONS=fra=wss://floor42-game.fly.dev,iad=wss://floor42-game-iad.fly.dev`. Merge `online-bots`
   into the deploy branch and push. A push to `main` deploys production, so do this only when ready.
5. Measure on the real thing, before announcing:
   - `curl -w "%{time_connect}\n" -o /dev/null -s https://floor42-game.fly.dev/ping` from Baku.
   - Play a bot match and read the badge.
   - Run `TICK_STATS=1` (set as env, then `flyctl logs`) during a match and check that `hz` stays 60 and `gapP99`
     stays under 25 ms (CPU throttling, risk 2).
   - Run `tools/netlab/botload.mts` against the deployed URL with 5-10 rooms.
6. Roll back: unset `NEXT_PUBLIC_ONLINE` and redeploy the site. `flyctl scale count 0` or `apps destroy` the iad app.

## 12. Portal multiplayer rules (for later; the portal build has no online today)

**CrazyGames** (https://docs.crazygames.com/requirements/multiplayer/, /sdk/game/, /requirements/account-integration/):

- "Play with Friends" needs a CrazyGames account. The first player of a party must go straight into a new private
  room ("instant multiplayer"). Report the room with `game.updateRoom({roomId, isJoinable, inviteParams})` and
  `leftRoom()`.
- Players who join through it should skip onboarding. Round-based games must let the group keep playing together
  (our rematch does).
- Submit lobby sizes with the build. Show CrazyGames usernames. Chat must respect `disableChat` and be filtered (we
  have no chat).
- No external logins; guests can play.
- `game.inviteLink`, `getInviteParam`, `isInstantMultiplayer`. Invite links may carry `region`, and room ids must be
  unique across regions. Colyseus ids are random 9 characters [Estimate: collisions negligible].
- Nothing on bots or matchmaking time.

**Poki** (https://developers.poki.com/guide/external-resources-policy, /requirements-quality, /sdk-html5):

- All external requests are blocked by default. "Externally hosted game servers are fine once approved by Poki":
  request the exact URLs under Settings → CSP, plus a privacy policy linked in-game.
- No chat systems. Strict profanity filter if there is a username input.
- Invites go through `PokiSDK.shareableURL` / `getURLParam` (parameters prefixed `gd`).
- Nothing on bots. Poki has its own beta WebRTC library (netlib).

Both would need SDK work: invite links through their APIs, our `/play?room=` replaced, and the Fly hosts whitelisted
on Poki.

## 13. NOT verified

- Browser bot + standby: the 4409 race and a standby room dropping mid-bot-match were never hit in a browser. The
  offer while both players sit on result screens was tested only in the server test.
- TURN with short-lived credentials (not built). Server-side WebRTC (not built). Direct-line numbers on real NATs and
  phones (sim plus local browsers only).

- Anything on Fly: cold start time, `shared-cpu-1x` throttling under a real match, WebSocket over shared IPv4, real
  RTTs, whether internal checks keep machines awake. Docker image build (keychain prompt).
- Two real regions. The fallback was tested with two local servers posing as fra and iad, plus unit tests.
- Phones, real Wi-Fi/mobile loss, strict NATs (direct line) and real humans on different networks.
- Behaviour under many simultaneous quick-match presses (race of the bot with a join: unit-level only, code 4409
  path never hit in a browser).
- The CD look for all online screens (R-032 open).
