"""
Pewfield brand SVGs: text to paths (brand README section 0). Reads the Creative Director's SVG sources in
docs/collab/CREATIVE/brand/svg/ (live Titan One text, 40 KB of embedded font each), draws every <text> as an outline with
the font's own metrics and kerning, drops the embedded fonts, and writes the result. Usage:
  python3 tools/brand/outline.py <source.svg> <out.svg> [--no-text]    (--no-text: the burst alone, for favicons)
Needs fontTools (pip install fonttools brotli). Font: src/components/fieldday/fonts/TitanOne-Regular.woff2 (SIL OFL).
"""
import re, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = TTFont('src/components/fieldday/fonts/TitanOne-Regular.woff2')
GS, CMAP, HMTX, UPM = FONT.getGlyphSet(), FONT.getBestCmap(), FONT['hmtx'], FONT['head'].unitsPerEm

def kern_table():
    pairs = {}
    gpos = FONT['GPOS'].table
    for lk in gpos.LookupList.Lookup:
        for st in lk.SubTable:
            if st.LookupType == 9: st = st.ExtSubTable
            if st.LookupType != 2 and getattr(st, 'LookupType', 2) != 2: continue
            if st.Format == 1:
                for g1, ps in zip(st.Coverage.glyphs, st.PairSet):
                    for r in ps.PairValueRecord:
                        v = r.Value1.XAdvance if r.Value1 and hasattr(r.Value1, 'XAdvance') else 0
                        pairs.setdefault((g1, r.SecondGlyph), v)
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs; c2 = st.ClassDef2.classDefs
                for g1 in st.Coverage.glyphs:
                    rec = st.Class1Record[c1.get(g1, 0)]
                    for g2 in FONT.getGlyphOrder():
                        r = rec.Class2Record[c2.get(g2, 0)]
                        v = r.Value1.XAdvance if r.Value1 and hasattr(r.Value1, 'XAdvance') else 0
                        if v: pairs.setdefault((g1, g2), v)
    return pairs
KERN = kern_table()

def outline(text, x, y, size, spacing, anchor):
    names = [CMAP[ord(c)] for c in text]
    s = size / UPM
    pen_x, items = 0.0, []
    for i, n in enumerate(names):
        items.append((n, pen_x))
        pen_x += HMTX[n][0] * s + spacing
        if i + 1 < len(names): pen_x += KERN.get((n, names[i + 1]), 0) * s
    total = pen_x - spacing if False else pen_x  # CSS letter-spacing is added after every glyph, including the last
    start = x - total / 2 if anchor == 'middle' else x
    pen = SVGPathPen(GS, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    for n, px in items:
        GS[n].draw(TransformPen(pen, (s, 0, 0, -s, start + px, y)))
    return pen.getCommands()

def main():
    src, out = sys.argv[1], sys.argv[2]
    svg = open(src).read()
    svg = re.sub(r'<style>.*?</style>', '', svg, flags=re.S)
    def rep(m):
        a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
        d = outline(m.group(2), float(a['x']), float(a['y']), float(a['font-size']), float(a.get('letter-spacing', 0)), a.get('text-anchor', 'start'))
        keep = ' '.join(f'{k}="{v}"' for k, v in a.items() if k in ('fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'paint-order', 'transform'))
        return f'<path d="{d}" {keep}/>'
    if '--no-text' in sys.argv:
        svg = re.sub(r'<g transform="rotate\(-7[^"]*"><text.*?</g>', '', svg, flags=re.S)
    svg = re.sub(r'<text ([^>]*)>([^<]*)</text>', rep, svg)
    svg = re.sub(r'\s+/>', '/>', svg)
    open(out, 'w').write(svg)
main()
