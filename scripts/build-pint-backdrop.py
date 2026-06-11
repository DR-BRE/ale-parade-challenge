#!/usr/bin/env python3
"""Rebuild public/pint-settle.mp4: settling-pint footage composited over a bar photo.

Inputs:
  - original footage (810x1440, 7s crossfade loop): git show 1fb918f:public/pint-settle.mp4
  - venue photo (portrait, ~9:16): e.g. ~/Downloads/JJ's.PNG

The camera in the footage never moves, so one mask works for every frame.
The mask keeps the glass + the brass tray band (y>590) as video and shows the
photo everywhere else. Glass segmentation: temporal motion map (background
moves, glass doesn't) + color rules + connected-component cleanup. The thin
see-through gap between the rim and the foam stays photo, so the only motion
in the final asset is the beer settling.

Usage: python3 scripts/build-pint-backdrop.py <original.mp4> <photo> <out.mp4>
Requires: ffmpeg, pillow, numpy
"""
import subprocess, sys, tempfile, glob, os
from PIL import Image, ImageFilter, ImageDraw, ImageChops, ImageOps
import numpy as np

# The mask is built in 810x1440 space (where these constants were calibrated)
# and resized to the source video's resolution for compositing.
W, H = 810, 1440
BAND_Y = 590          # top of the tray/bar band kept as video
RIM_TOP = 168         # nothing above this is glass
RIM_CLAMP = (146, 702)   # max glass extent in the rim zone (y < 320)
BODY_CLAMP = (105, 715)  # max glass extent in the body zone (320..BAND_Y)
HOLE_SPLIT_Y = 310    # interior holes below = churn (video), above = rim gap (photo)
# The bright specular streak on the glass's left wall refracts the moving
# background, so motion segmentation rejects it; reclaim it explicitly.
STREAK_ZONE = (112, 285, 300, BAND_Y)  # x0, x1, y0, y1
STREAK_LUM = 188

def fill_holes(img):
    ff = img.copy()
    for x in range(0, W, 16):
        for y in (1, H - 2):
            if ff.getpixel((x, y)) == 0: ImageDraw.floodfill(ff, (x, y), 128)
    for y in range(0, H, 16):
        for x in (1, W - 2):
            if ff.getpixel((x, y)) == 0: ImageDraw.floodfill(ff, (x, y), 128)
    a = np.asarray(ff)
    return Image.fromarray(np.where(a == 128, 0, 255).astype(np.uint8))

def center_component(img):
    for y in range(400, 580, 20):
        for x in range(320, 500, 20):
            if img.getpixel((x, y)) == 255:
                ff = img.copy()
                ImageDraw.floodfill(ff, (x, y), 200)
                return Image.fromarray((np.asarray(ff) == 200).astype(np.uint8) * 255)
    raise SystemExit('no glass seed found')

def build_mask(frames_dir):
    paths = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
    grays = [Image.open(p).convert('L') for p in paths]
    acc = Image.new('L', (W, H), 0)
    for i in range(len(grays)):
        for j in (i + 3, i + 6):
            if j < len(grays):
                acc = ImageChops.lighter(acc, ImageChops.difference(grays[i], grays[j]))
    motion = np.asarray(ImageOps.autocontrast(acc)).astype(np.float64)

    ref = np.asarray(Image.open(paths[len(paths)//2]).convert('RGB')).astype(np.float64)
    lum = 0.299*ref[:,:,0] + 0.587*ref[:,:,1] + 0.114*ref[:,:,2]
    sat = ref.max(axis=2) - ref.min(axis=2)

    bg0 = (motion > 46) | (ref[:,:,1] > ref[:,:,0] + 10)
    m = Image.fromarray(((~bg0) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    m = m.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))

    ma = np.asarray(m.point(lambda v: 255 if v > 127 else 0)).copy()
    ma[:RIM_TOP, :] = 0
    ma[RIM_TOP:320, :RIM_CLAMP[0]] = 0
    ma[RIM_TOP:320, RIM_CLAMP[1]:] = 0
    ma[320:BAND_Y, :BODY_CLAMP[0]] = 0
    ma[320:BAND_Y, BODY_CLAMP[1]:] = 0
    comp = center_component(fill_holes(Image.fromarray(ma)))

    # strip bright low-sat regions connected to the frame edge (white wall),
    # keeping the bright specular streak inside the glass
    ca = np.asarray(comp) > 127
    bright = (lum > 196) & (sat < 38) & ca
    bi = Image.fromarray((bright * 255).astype(np.uint8))
    for x in range(0, W, 12):
        for y in (1, BAND_Y - 2):
            if bi.getpixel((x, y)) == 255: ImageDraw.floodfill(bi, (x, y), 128)
    for y in range(0, BAND_Y, 12):
        for x in (1, W - 2):
            if bi.getpixel((x, y)) == 255: ImageDraw.floodfill(bi, (x, y), 128)
    wall = np.asarray(bi) == 128
    kept = ca & ~wall

    # reclaim the left-wall specular streak (see STREAK_ZONE note above)
    x0, x1, y0, y1 = STREAK_ZONE
    streak = np.zeros_like(kept)
    streak[y0:y1, x0:x1] = lum[y0:y1, x0:x1] > STREAK_LUM
    comp = Image.fromarray(((kept | streak) * 255).astype(np.uint8))

    g = comp.filter(ImageFilter.MaxFilter(17))  # ~8px outward: recapture the rim
    ImageDraw.Draw(g).rectangle([0, BAND_Y, W, H], fill=255)

    # resolve interior holes by position (churn -> video, rim gap -> photo)
    ff = g.copy()
    for x in range(0, W, 16):
        if ff.getpixel((x, 1)) == 0: ImageDraw.floodfill(ff, (x, 1), 128)
    for y in range(0, H, 16):
        for x in (1, W - 2):
            if ff.getpixel((x, y)) == 0: ImageDraw.floodfill(ff, (x, y), 128)
    for yy in range(170, BAND_Y, 6):
        for xx in range(110, 712, 6):
            if ff.getpixel((xx, yy)) == 0:
                ImageDraw.floodfill(ff, (xx, yy), 255 if yy > HOLE_SPLIT_Y else 60)
    fa = np.asarray(ff)
    g = Image.fromarray(np.where((fa == 128) | (fa == 60), 0, fa).astype(np.uint8))
    return g.filter(ImageFilter.GaussianBlur(5))

def prep_photo(path, w, h):
    bg = Image.open(path).convert('RGB')
    s = w / bg.width
    bg = bg.resize((w, round(bg.height * s)), Image.LANCZOS)
    top = (bg.height - h) // 2
    # blur sits the photo in the footage's depth of field (4px at 810 wide)
    return bg.crop((0, top, w, top + h)).filter(ImageFilter.GaussianBlur(4 * w / W))

def src_dims(src):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                          '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src],
                         check=True, capture_output=True, text=True).stdout
    w, h = map(int, out.strip().split(','))
    return w, h

def main():
    src, photo, out = sys.argv[1:4]
    sw, sh = src_dims(src)
    with tempfile.TemporaryDirectory() as td:
        # mask is built in 810x1440 space regardless of source resolution
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src,
                        '-vf', f'fps=2,scale={W}:{H}', os.path.join(td, 'f%02d.png')], check=True)
        mask_p, bg_p = os.path.join(td, 'mask.png'), os.path.join(td, 'bg.png')
        build_mask(td).resize((sw, sh), Image.LANCZOS).save(mask_p)
        prep_photo(photo, sw, sh).save(bg_p)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src,
                        '-loop', '1', '-i', bg_p, '-loop', '1', '-i', mask_p,
                        '-filter_complex',
                        '[2:v]format=gray[m];[0:v][m]alphamerge[fg];'
                        '[1:v][fg]overlay=0:0:shortest=1,format=yuv420p[out]',
                        '-map', '[out]', '-t', '6.966667',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
                        '-movflags', '+faststart', '-an', out], check=True)
    print('wrote', out)

if __name__ == '__main__':
    main()
