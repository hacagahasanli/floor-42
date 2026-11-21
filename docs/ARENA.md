# Floor 42 arena: interaction and readability

Analysis of the arena against Reis's concept (`feedback4/ref/f42-arena-concept.png`, same camera angle) and of the
collision data in `src/game/sim/constants.ts` (`ARENA.platforms`) against what `src/game/render/arena.ts` draws.
Written before the changes; the "After" section at the end says what was built.

## How the arena reads (the rule we keep)

The camera looks straight at a 2.5D slice of an office. Fighters live in one plane (z = 0). Two kinds of furniture:

- **In the fight plane** (front, z between -1.3 and +0.5): desks, the meeting table, the kitchen counter, walkways, the
  cable tray. If it stands on the floor here it is solid (you hop onto it, you never walk into it). If it hangs, it is a
  one-way floor (jump up through it, Down drops you).
- **Against the back wall** (z below -2.2): bookshelf, wall cabinets, plants, printer, water cooler, whiteboard, clock,
  neon. You walk in front of them. Only tall storage with a clear deep top (bookshelf, wall cabinets) is something you
  can stand on, as a one-way top.

Everything new follows the same rule, so a player never has to learn an exception.

## 1. Existing objects that should be walkable

| Object | Where (x, top) | Today | Keep |
| --- | --- | --- | --- |
| Desks (2) | -15.5..-11.5, -9.6..-6.2, 1.1 | solid | solid |
| Meeting table | -3..3, 1.0 | solid | solid |
| Kitchen counter | 9..13.6, 1.2 | solid | solid |
| Fridge | 15.8..17.9, 2.8 | one-way top | one-way top, moved back to the wall (see mismatches) |
| Bookshelf | -17.9..-16.1, 3.4 | one-way top | one-way top |
| Wall cabinets (2) | ±11.5..±14.5, 6.0 | one-way | one-way |
| Lower walkways (2) | ±2.6..±8.2, 4.4 | one-way | one-way |
| Cable tray | -1.6..1.6, 7.2 | one-way | one-way (the hanging "special" surface) |
| Balconies (2) | ±9.5..±17.9, 9.4 | one-way | one-way |
| Centre beam | -4.5..4.5, 10.6 | one-way | one-way |

## 2. Objects that should stay decorative (pass-through, no collision)

Office chairs, monitors, keyboards, mugs, desk lamps and the desk fan on desks (all behind the fighter, below head
height); the coffee machine and its steam; potted plants; the printer; the water cooler; the whiteboard; the neon
sign; the clock; the ceiling lights, light cones, ducts and vents; walkway rails and hanger rods; the cables under the
tray; the rug; the city outside. New: hanging pendant lamps, wall monitors, wall ventilation units.

## 3. Objects that could become interesting jumpable surfaces

- **The server rack.** Today a 2.2 m decorative box at the back wall behind the table: it looks exactly like something
  you could climb. Becomes a real, solid rack standing on the right walkway, as tall cover and a step to the tray.
- **Crates and metal boxes** (concept: "kate", "metal sandıq"): low solid boxes on the walkway and balcony ends, as cover
  and as half-steps.
- **Small hanging platforms** (concept: "kiçik platforma"): two thin one-way steel ledges between the lower walkways and
  the balconies, an inner route up that does not go through the wall cabinets.
- Considered and rejected: chair seats (too small, they read as clutter), the coffee machine (on a walkable top, it would
  make the counter top bumpy), the ducts (ceiling height, no room above them), the whiteboard ledge (thin, against the
  wall), crates on top of the bookshelf (decor on a walkable top hides where you can stand).

## 4. Areas where objects would improve the arena

- **The inner ends of the lower walkways** (around x ±3, y 4.4): bare today, and the jump to the tray is a blind leap.
  A crate (left) and the server rack (right) give cover from the centre and a step up to the tray.
- **The gap between the walkways and the balconies** (x ±7..±9, y 5..9): empty blue window. The only way up is the
  wall cabinet. A small hanging ledge on each side adds an inner route.
- **The balconies** (y 9.4): long flat strips where the power-weapon fight happens with no cover at all. One metal box
  on each, between the spawn and the centre.
- **The back wall above the cabinets and under the ceiling**: empty. Wall monitors and ventilation units add office
  detail without touching the fight plane.
- **The air above the walkways**: pendant lamps hung behind the fight plane, warm pools over the places you stand.
- **Not the floor lane.** The floor between the table and the counter is where most fights start, the menu backdrop
  fighter stands there, and every "across the office" shot crosses it. It stays open.

## 5. Proposed collision and interaction classification

| Class | Collision | Bullets | Objects |
| --- | --- | --- | --- |
| A. Solid box | stand on top; sides and underside stop you; Down does nothing on top | a top stops only steep shots (flat shots skim it); a **closed** box (crate, metal box, rack) also stops shots through its sides | desks, table, counter (open underneath: sides let shots through); crates, metal boxes, server rack (closed: sides stop shots) |
| A. One-way floor | land on top, jump up through, Down drops through | stops every shot crossing it, both ways | walkways, balconies, beam, cable tray, small ledges, bookshelf top, wall cabinets, fridge top |
| B. Decorative | none | none | everything in section 2 |
| C. Conditional | not built | | chair seats, coffee machine, ducts, whiteboard ledge |

Solid boxes no longer have to stand on the floor: a box has a `base` (default: the floor) so a crate can sit on a
walkway. Its underside stops a jump from below.

## 6. Most important visual improvements

1. Walkable tops are lighter than their sides, with a lighter top edge (a lip catching the key light), and cast real
   shadows. Decor stays darker, thin, and against the back wall.
2. Desks and the table get end panels where their collision ends, so their solid sides are visible.
3. The fridge moves back against the wall like the bookshelf, so walking in front of it no longer clips through it.
4. The server rack stops being a fake platform at the back and becomes a real one in the fight plane.
5. Cover from the concept (crates, metal boxes, the rack) on the walkways and balconies, not on the floor lane.
6. Hanger rods stop at the platform they hold instead of piercing the beam above.
7. Office detail from the concept on the back wall: wall monitors, ventilation units, pendant lamps. No outlines,
   no glow, no labels.

## Collision vs visuals: mismatches found

Checked every entry of `ARENA.platforms`, spawns and gun spots against its builder in `render/arena.ts`.

1. **Gun spot floating in the air.** `gunSpawns[2]` has a spot at `{ x: 4, y: 1.0 }`, but the meeting table ends at
   x = 3. That gun hangs 1 m above the open floor; you could only take it by jumping into empty air.
2. **Fake platform: the server rack.** A 2.2 m solid-looking box at (1.9, z -2.9) behind the table with no collision.
   Standing on the table, it looks like the obvious next step, and you fall through it.
3. **The fridge clips the fight plane.** It is a one-way platform (correct: it is tall storage like the bookshelf),
   but it is drawn at z -0.7 with its front 0.2 m behind the fighters, so walking past it the fighter visibly sinks into
   a closed box. The bookshelf and wall cabinets are drawn against the back wall, the fridge is not.
4. **Meeting table: solid air under the overhang.** The collision is solid from the floor across the full -3..3, but
   the two leg panels stand 0.6 m in from each end: you stop against empty space under the tabletop.
5. **Desks: thin legs on a solid box.** Desks collide from the floor up, but are drawn as a top on four thin legs with
   an open space and a chair under it, which reads as something you could walk under.
6. **Hanger rods through the beam.** The lower walkways' inner rods (x ±2.9) and the tray's rods (x ±1.4) run from
   their platform to the ceiling straight through the centre beam (y 10.6), and through anyone standing on it.

Nothing collides that looks decorative (chairs, monitors, plants, cooler, printer and the coffee machine have no
collision), and no platform top sits above or below its drawn surface: every builder puts its top face at `p.y`.
Landing needs half the body's half-width over the edge, so nobody stands on air past an edge.

## After: what was built

Collision data (`ARENA.platforms`, all in the shared sim, so offline, bots and online play use the same thing):

| New object | x | stands on | top | class |
| --- | --- | --- | --- | --- |
| Wooden crate | -3.7..-2.6 | left walkway (4.4) | 5.4 | closed box: cover, step up to the tray |
| Server rack | 2.6..3.5 | right walkway (4.4) | 6.4 | closed box: full cover, step up to the tray |
| Small hanging ledges | ±7.2..±9.0 | hung from the ceiling | 7.6 | one-way: walkway → ledge → balcony |
| Metal boxes | ±11..±12 | balconies (9.4) | 10.4 | closed box: leg cover on the top floor |

- Solid boxes have a `base`; their underside stops a jump from below (`step.ts`), and closed boxes stop shots
  through their sides (`CLOSED_STYLES`). Rails still go through everything.
- The bot hops onto a box on its own level and jumps again near the top of the hop if one jump is not enough.
- Fixes: the floating gun spot is on the floor (x 4); the decorative rack at the back is gone (the real one is on the
  walkway); the fridge stands against the back wall; the table's legs and the desks' end panels sit where their
  collision ends; hanger rods stop under the platform above and step around boxes.
- Readability: lighter tops and pale front nosings on walkways, the tray, ledges and the bookshelf; crates and boxes
  have the lightest lid and dark sides; all decor (pendant lamps, wall monitors, ventilation) is thin, darker, and
  behind the fight plane.
- Performance: all furniture and wall decor is merged into one mesh per material at load (`mergeStatic`), the rack's
  status lights are one instanced mesh. See the draw-call numbers in the commit history / report.
- Tests: `src/game/sim/arena.test.ts`.
