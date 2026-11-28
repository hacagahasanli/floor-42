# Contact sheet: rows = guns, cols = frames, each cropped to the fight centre.
import sys, glob, os
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(__file__), 'before')
guns = ['pistol', 'smg', 'uzi', 'shotgun', 'railgun', 'launcher']
box = (330, 380, 950, 640)  # x0,y0,x1,y1 at 1280x720
cw, ch = (box[2]-box[0])//2, (box[3]-box[1])//2
cols = 6
sheet = Image.new('RGB', (cols*cw + 90, len(guns)*ch), 'white')
d = ImageDraw.Draw(sheet)
for r, g in enumerate(guns):
    files = sorted(glob.glob(f'{D}/gun-{g}-*.png'))[:cols]
    d.text((6, r*ch + ch//2), g, fill='black')
    for c, f in enumerate(files):
        im = Image.open(f).convert('RGB').crop(box).resize((cw, ch))
        sheet.paste(im, (90 + c*cw, r*ch))
sheet.save(os.path.join(os.path.dirname(__file__), 'before-guns-sheet.png'))
