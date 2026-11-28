import sys
from PIL import Image, ImageFilter
LOGO = Image.open('logo-pad-2400.png').convert('RGBA')  # 2400x1088, transparent, outlined paths (engineering export + 24 px bottom pad)
def logo(width):
    return LOGO.resize((width, round(width * LOGO.height / LOGO.width)), Image.LANCZOS)
def crop(src, box, size):
    im = Image.open(src).convert('RGB').crop(box)
    return im.resize(size, Image.LANCZOS)
def put_logo(im, width, xy, glow=0):
    im = im.convert('RGBA')
    L = logo(width)
    if glow:
        # soft cream halo behind the logo for separation (alpha of logo, blurred)
        a = L.split()[3].filter(ImageFilter.GaussianBlur(glow))
        halo = Image.new('RGBA', L.size, (255, 243, 214, 0)); halo.putalpha(a.point(lambda v: int(v * 0.55)))
        im.alpha_composite(halo, xy)
    im.alpha_composite(L, xy)
    return im.convert('RGB')
