"""
Builds the Floor 42 logo set from the Bungee font (SIL OFL): the clash emblem and the sliced wordmark.

  python3 tools/brand/logo.py path/to/Bungee.woff2

Writes public/brand/{logo,logo-light,logo-mono,emblem}.svg and public/favicon.svg. Every letter is an outline,
so the files render the same as <img>, in a browser tab and on other sites, with no font loaded.

The idea: two fighters meet in the middle. The emblem is an angular badge with an impact burst behind a
heavy, slanted 42, cut through by one bright strike; the wordmark is sliced along that same strike.
"""
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
font = TTFont(sys.argv[1])
gs = font.getGlyphSet()
cmap = font.getBestCmap()
UPM = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight or 0.72 * UPM

GOLD, CREAM, INK, NAVY, NAVY2, RED, ORANGE = '#FFD23F', '#F4EFE6', '#16110E', '#26305A', '#0B0F1E', '#FF3B4E', '#FF7A2F'


def text_path(s, x, y, cap_px, skew=-10, track=0.0):
    """Outline of `s` with its baseline at (x, y), caps `cap_px` tall, slanted by `skew` degrees. Returns (d, width)."""
    k = cap_px / CAP
    sk = math.tan(math.radians(-skew))
    svg = SVGPathPen(gs, lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
    pen_x = 0.0
    for ch in s:
        g = cmap[ord(ch)]
        # Font units are y-up: flip, scale, slant, place.
        t = TransformPen(svg, (k, 0, sk * k, -k, x + pen_x, y))
        gs[g].draw(t)
        pen_x += gs[g].width * k + track
    return svg.getCommands(), pen_x - track


def burst(cx, cy, r_out, r_in, n, seed, rot=0.0):
    """A jagged impact star: alternating long and short points, a little irregular so it reads as a hit, not a sticker."""
    pts = []
    for i in range(n * 2):
        a = rot + i * math.pi / n
        jitter = 1 + 0.16 * math.sin(seed + i * 2.399)
        r = (r_out if i % 2 == 0 else r_in) * jitter
        pts.append(f'{cx + r * math.cos(a):.1f} {cy + r * math.sin(a):.1f}')
    return 'M' + 'L'.join(pts) + 'Z'


BADGE = 'M28 0H200L236 36V236L208 264H36L0 228V28Z'  # cut corners, a little asymmetric


def emblem(ox=0, oy=0, mono=None):
    """The 264 px clash badge: dark plate, red-orange impact burst, the gold 42, one white strike across it."""
    c = (lambda col: mono) if mono else (lambda col: col)
    d42, w42 = text_path('42', 0, 0, 112, skew=-12, track=-6)
    tx, ty = ox + 118 - w42 / 2 - 6, oy + 190
    out = [f'<g transform="translate({ox} {oy})">']
    if not mono:
        out.append(f'<path d="{BADGE}" fill="url(#f42plate)"/>')
        out.append(f'<path d="{BADGE}" fill="none" stroke="{GOLD}" stroke-opacity=".55" stroke-width="4"/>')
        out.append(f'<g clip-path="url(#f42clip)">'
                   f'<path d="{burst(118, 132, 124, 70, 11, 1.3, 0.2)}" fill="url(#f42burst)"/>'
                   f'<path d="{burst(118, 132, 80, 50, 11, 2.1, 0.45)}" fill="{GOLD}" fill-opacity=".22"/>'
                   # Speed lines coming in from both sides: two fighters closing in.
                   + ''.join(f'<path d="M{x0} {y}h{w}l-6 6h-{w}z" fill="{CREAM}" fill-opacity=".5"/>' for x0, y, w in
                             [(-4, 58, 44), (-4, 214, 30), (196, 46, 44), (206, 200, 34)])
                   + '</g>')
    else:
        out.append(f'<path d="{BADGE}" fill="none" stroke="{mono}" stroke-width="10"/>')
    out.append('</g>')
    # The mask sits outside the translate so its slice is in page coordinates.
    shadow = '' if mono else (f'<path d="{d42}" fill="{INK}" stroke="{INK}" stroke-width="16" stroke-linejoin="round" transform="translate(5 8)"/>'
                              f'<path d="{d42}" fill="none" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/>')
    out.append(f'<g mask="url(#f42cutE)"><g transform="translate({tx:.1f} {ty:.1f})">{shadow}'
               f'<path d="{d42}" fill="{c("url(#f42gold)")}"/></g></g>')
    # The strike: a bright blade of light cutting the 42.
    strike = f'M{ox + 14} {oy + 196}L{ox + 226} {oy + 92}L{ox + 230} {oy + 100}L{ox + 22} {oy + 206}Z'
    out.append(f'<path d="{strike}" fill="{c("#FFFFFF")}" fill-opacity="{1 if mono else 0.92}"/>')
    return '\n'.join(out), strike


def defs(extra=''):
    return f'''<defs>
<linearGradient id="f42plate" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="{NAVY}"/><stop offset="1" stop-color="{NAVY2}"/></linearGradient>
<radialGradient id="f42burst" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="{ORANGE}"/><stop offset=".7" stop-color="{RED}"/><stop offset="1" stop-color="#8A1030"/></radialGradient>
<linearGradient id="f42gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1A8"/><stop offset=".55" stop-color="{GOLD}"/><stop offset="1" stop-color="#F0A21C"/></linearGradient>
<clipPath id="f42clip"><path d="{BADGE}"/></clipPath>
{extra}
</defs>'''


def cut_mask(mid, x0, y0, x1, y1, gap):
    """A mask that slices whatever uses it along the strike line, leaving a thin gap."""
    (ax, ay), (bx, by) = mid
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * gap / 2, dx / L * gap / 2
    ext = 4000 / L
    p = lambda t, s: f'{ax + dx * t + nx * s:.1f} {ay + dy * t + ny * s:.1f}'
    return (f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="#fff"/>'
            f'<path d="M{p(-ext, 1)}L{p(ext, 1)}L{p(ext, -1)}L{p(-ext, -1)}Z" fill="#000"/>')


def wordmark(x, light=False, mono=None):
    """FLOOR 42, heavy and slanted, sliced once by a strike that runs through the whole line."""
    fill_floor = mono or (INK if light else CREAM)
    fill_42 = mono or ('url(#f42gold)' if not light else '#E0A800')
    outline = mono or (CREAM if light else INK)
    dF, wF = text_path('FLOOR', x, 180, 96, skew=-12, track=2)
    d4, w4 = text_path('42', x + wF + 28, 192, 124, skew=-12, track=-4)
    parts = []
    if not mono:
        # A hard drop shadow so it holds on any background.
        parts.append(f'<g transform="translate(6 8)" fill="{INK if not light else "#0000"}" opacity=".85"><path d="{dF}"/><path d="{d4}"/></g>')
    parts.append(f'<g mask="url(#f42cutW)">'
                 f'<path d="{dF}" fill="none" stroke="{outline}" stroke-width="10" stroke-linejoin="round"/>'
                 f'<path d="{d4}" fill="none" stroke="{outline}" stroke-width="10" stroke-linejoin="round"/>'
                 f'<path d="{dF}" fill="{fill_floor}"/><path d="{d4}" fill="{fill_42}"/></g>')
    # An underline that ends in a blade tip: the hit that just landed.
    end = x + wF + 28 + w4 + 10
    if not mono:
        parts.append(f'<path d="M{x + 6} 214H{end - 40}L{end} 206L{end - 50} 226H{x - 2}Z" fill="{RED}"/>')
        parts.append(f'<path d="M{x + 10} 214H{end - 60}L{end - 52} 210H{x + 14}Z" fill="{ORANGE}"/>')
    else:
        parts.append(f'<path d="M{x + 6} 214H{end - 40}L{end} 206L{end - 50} 226H{x - 2}Z" fill="{mono}"/>')
    return '\n'.join(parts), end


def logo(light=False, mono=None):
    em, _ = emblem(0, 0, mono)
    wm, end = wordmark(278, light, mono)
    W = 1078
    # Both slices follow the same direction: a single strike crossing badge and name.
    em_mask = cut_mask(((14, 200), (230, 96)), -40, -40, 300, 300, 7)
    wm_mask = cut_mask(((300, 228), (980, 40)), 240, -40, W + 40, 300, 7)
    extra = f'<mask id="f42cutE" maskUnits="userSpaceOnUse" x="-40" y="-40" width="340" height="340">{em_mask}</mask>' \
            f'<mask id="f42cutW" maskUnits="userSpaceOnUse" x="240" y="-40" width="{W}" height="340">{wm_mask}</mask>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -3 {W} 270" role="img" aria-label="Floor 42"><title>Floor 42</title>'
            f'{defs(extra)}\n{em}\n{wm}</svg>\n'), end


def emblem_svg(size_box='-8 -8 280 280'):
    em, _ = emblem(0, 0)
    extra = f'<mask id="f42cutE" maskUnits="userSpaceOnUse" x="-40" y="-40" width="340" height="340">{cut_mask(((14, 200), (230, 96)), -40, -40, 300, 300, 7)}</mask>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{size_box}" role="img" aria-label="Floor 42"><title>Floor 42</title>{defs(extra)}\n{em}</svg>\n'


out = ROOT / 'public'
svg, end = logo()
print('wordmark ends at', round(end))
(out / 'brand/logo.svg').write_text(svg)
(out / 'brand/logo-light.svg').write_text(logo(light=True)[0])
(out / 'brand/logo-mono.svg').write_text(logo(mono='#16110E')[0])
(out / 'brand/emblem.svg').write_text(emblem_svg())
(out / 'favicon.svg').write_text(emblem_svg('-4 -4 244 272'))
