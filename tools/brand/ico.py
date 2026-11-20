"""Packs public/favicon-16.png and favicon-32.png into public/favicon.ico (needs Pillow)."""
from pathlib import Path
from PIL import Image

pub = Path(__file__).resolve().parents[2] / 'public'
big = Image.open(pub / 'favicon-32.png').convert('RGBA')
big.save(pub / 'favicon.ico', sizes=[(16, 16), (32, 32)], append_images=[Image.open(pub / 'favicon-16.png').convert('RGBA')])
