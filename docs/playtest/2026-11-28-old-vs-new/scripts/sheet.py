# Side-by-side contact sheet: OLD (left) vs NEW (right) at the same timestamps from load.
# Usage: python3 sheet.py 1280   -> sheets/first60-1280.png
import sys, os
from PIL import Image, ImageDraw, ImageFont
W = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ts = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60]
th = 360  # thumb width
rows = []
for t in ts:
    pair = []
    for b in ('old', 'new'):
        p = os.path.join(root, 'shots', f'{b}-{W}-t{t:02d}.png')
        im = Image.open(p).convert('RGB') if os.path.exists(p) else Image.new('RGB', (1280, 720), (60, 0, 0))
        h = round(im.height * th / im.width)
        pair.append(im.resize((th, h)))
    rows.append((t, pair))
lab = 56
rh = rows[0][1][0].height
sheet = Image.new('RGB', (lab + 2 * th + 12, 30 + len(rows) * (rh + 6)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 16)
except Exception:
    font = ImageFont.load_default()
d.text((lab, 6), f'OLD ab70691 ({W})', fill=(255, 220, 120), font=font)
d.text((lab + th + 12, 6), f'NEW fce5403 ({W})', fill=(140, 220, 255), font=font)
for i, (t, pair) in enumerate(rows):
    y = 30 + i * (rh + 6)
    d.text((6, y + rh // 2 - 8), f'{t}s', fill=(255, 255, 255), font=font)
    sheet.paste(pair[0], (lab, y))
    sheet.paste(pair[1], (lab + th + 12, y))
out = os.path.join(root, 'sheets', f'first60-{W}.png')
sheet.save(out)
print(out, sheet.size)
