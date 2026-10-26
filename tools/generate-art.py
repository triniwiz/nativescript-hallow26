"""Generates the app icon, splash screens and repo banner for Hallow.

Usage (from the repo root):  python tools/generate-art.py
Requires Pillow (pip install pillow).
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "App_Resources"
ANDROID = RES / "Android" / "src" / "main" / "res"
IOS = RES / "iOS" / "Assets.xcassets"
WIN = RES / "Windows" / "Assets"
DOCS = ROOT / "docs"
CREEPSTER = str(ROOT / "src" / "fonts" / "Creepster-Regular.ttf")
FELL = str(ROOT / "src" / "fonts" / "IMFellEnglish-Italic.ttf")

NIGHT_950 = (7, 4, 11)
BONE_50 = (244, 239, 230)
BONE_200 = (221, 211, 194)
BLOOD_400 = (240, 82, 82)
BLOOD_500 = (220, 38, 38)
BLOOD_700 = (143, 20, 20)
PUMPKIN_300 = (253, 186, 116)
PUMPKIN_500 = (249, 115, 22)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def over(base, layer, cx, cy):
    """Alpha-composites `layer` centred on (cx, cy), clipping to `base`."""
    x0, y0 = int(cx - layer.width / 2), int(cy - layer.height / 2)
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1 = min(layer.width, base.width - x0)
    sy1 = min(layer.height, base.height - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    part = layer.crop((sx0, sy0, sx1, sy1))
    region = base.crop((x0 + sx0, y0 + sy0, x0 + sx1, y0 + sy1))
    base.paste(Image.alpha_composite(region, part), (x0 + sx0, y0 + sy0))


def radial(size):
    """L mask: 0 at the centre rising to 255 at the circle edge (Pillow's own gradient is corner-scaled)."""
    g = Image.radial_gradient("L").resize((size, size), Image.BILINEAR)
    return g.point(lambda v: min(255, int(v * 1.4142)))


def glow(base, cx, cy, radius, color, alpha):
    size = max(2, int(radius * 2))
    mask = ImageOps.invert(radial(size))
    mask = mask.point(lambda v: int((v / 255) ** 2 * 255 * alpha))
    layer = Image.new("RGBA", (size, size), color + (0,))
    layer.putalpha(mask)
    over(base, layer, cx, cy)


def vertical_gradient(w, h, top, bottom):
    strip = Image.new("RGB", (1, h))
    for y in range(h):
        strip.putpixel((0, y), lerp(top, bottom, y / max(1, h - 1)))
    return strip.resize((w, h)).convert("RGBA")


def night_background(w, h):
    bg = vertical_gradient(w, h, (24, 12, 36), NIGHT_950)
    glow(bg, w / 2, h * 0.62, max(w, h) * 0.8, (110, 12, 20), 0.35)
    return bg


def vignette(img, strength=0.55):
    w, h = img.size
    mask = radial(max(w, h)).resize((w, h), Image.BILINEAR).point(lambda v: int(v * strength))
    layer = Image.new("RGBA", (w, h), NIGHT_950 + (0,))
    layer.putalpha(mask)
    img.alpha_composite(layer)


def stars(img, rng, count, horizon, scale):
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, img.width), rng.uniform(0, horizon)
        r = rng.choice([0.6, 0.8, 1.0, 1.3, 1.8]) * scale
        d.ellipse((x - r, y - r, x + r, y + r), fill=BONE_50 + (rng.randint(70, 200),))


def moon_layer(R, seed=7):
    rng = random.Random(seed)
    R = int(R)
    C = R * 4
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    glow(layer, C / 2, C / 2, R * 1.95, BLOOD_700, 0.5)
    glow(layer, C / 2, C / 2, R * 1.35, BLOOD_500, 0.38)

    D = R * 2
    grad = radial(D)
    disc = ImageOps.colorize(grad, black=(255, 136, 106), mid=(222, 46, 44), white=(128, 14, 20),
                             blackpoint=0, midpoint=150, whitepoint=255).convert("RGBA")

    craters = Image.new("L", (D, D), 0)
    cd = ImageDraw.Draw(craters)
    for _ in range(9):
        a = rng.uniform(0, math.tau)
        dist = rng.uniform(0.05, 0.7) * R
        cr = rng.uniform(0.04, 0.16) * R
        cx, cy = R + math.cos(a) * dist, R + math.sin(a) * dist
        cd.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=rng.randint(25, 55))
    craters = craters.filter(ImageFilter.GaussianBlur(R * 0.05))
    shade = Image.new("RGBA", (D, D), (60, 4, 10, 0))
    shade.putalpha(craters)
    disc = Image.alpha_composite(disc, shade)

    mask = Image.new("L", (D * 2, D * 2), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, D * 2 - 1, D * 2 - 1), fill=255)
    disc.putalpha(mask.resize((D, D), Image.LANCZOS))
    layer.alpha_composite(disc, (C // 2 - R, C // 2 - R))
    return layer


def flame_points(cx, bottom, width, height, steps=48):
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        hw = width * math.sin(math.pi * t ** 0.65) * (1 - t) ** 0.25
        y = bottom - t * height
        left.append((cx - hw, y))
        right.append((cx + hw, y))
    return left + right[::-1]


def emblem(S):
    """A blood moon with a lit candle in front of it, on a transparent canvas of 1.6S."""
    SS = 2
    C = int(S * 1.6)
    off = (C - S) / 2
    big = Image.new("RGBA", (C * SS, C * SS), (0, 0, 0, 0))
    u = S * SS
    ox = oy = off * SS

    over(big, moon_layer(0.31 * u), ox + 0.5 * u, oy + 0.40 * u)

    d = ImageDraw.Draw(big)
    cx = ox + 0.5 * u
    half = 0.088 * u
    top, bottom = oy + 0.66 * u, oy + 0.94 * u

    body = Image.new("RGBA", (int(half * 2), int(bottom - top)))
    bd = ImageDraw.Draw(body)
    for x in range(body.width):
        bd.line((x, 0, x, body.height), fill=lerp(BONE_50, (150, 138, 124), (x / body.width) ** 1.4) + (255,))
    body_mask = Image.new("L", body.size, 0)
    ImageDraw.Draw(body_mask).rounded_rectangle(
        (0, 0, body.width - 1, body.height - 1), radius=int(0.012 * u), fill=255)
    body.putalpha(body_mask)
    big.alpha_composite(body, (int(cx - half), int(top)))

    ell = 0.02 * u
    d.ellipse((cx - half, top - ell, cx + half, top + ell), fill=BONE_200 + (255,))
    d.ellipse((cx - half * 0.55, top - ell * 0.45, cx + half * 0.55, top + ell * 0.45), fill=(255, 226, 170, 255))
    for dx, ln in ((-0.062, 0.075), (0.045, 0.115), (0.006, 0.05)):
        x = cx + dx * u
        wd = 0.02 * u
        d.rounded_rectangle((x - wd / 2, top, x + wd / 2, top + ln * u), radius=wd / 2, fill=BONE_50 + (255,))

    wick_top = top - ell - 0.035 * u
    d.line((cx, top, cx, wick_top), fill=(20, 12, 18, 255), width=max(2, int(0.007 * u)))

    fb = wick_top + 0.02 * u
    glow(big, cx, fb - 0.12 * u, 0.42 * u, PUMPKIN_500, 0.5)
    glow(big, cx, fb - 0.12 * u, 0.2 * u, PUMPKIN_300, 0.55)
    d = ImageDraw.Draw(big)
    for sw, sh, col, lift in ((1.0, 1.0, PUMPKIN_500, 0), (0.72, 0.8, PUMPKIN_300, 0.01), (0.4, 0.5, BONE_50, 0.02)):
        d.polygon(flame_points(cx, fb - lift * u, 0.062 * u * sw, 0.27 * u * sh), fill=col + (255,))

    return big.resize((C, C), Image.LANCZOS)


def icon(size, transparent=False, safe=0.9, rounded=0.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0)) if transparent else night_background(size, size)
    if not transparent:
        vignette(img, 0.5)
    over(img, emblem(max(8, int(size * safe))), size / 2, size / 2 + size * 0.01)
    if rounded:
        mask = Image.new("L", (size * 2, size * 2), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 2 - 1, size * 2 - 1), radius=int(size * 2 * rounded), fill=255)
        img.putalpha(ImageChops.multiply(img.getchannel("A"), mask.resize((size, size), Image.LANCZOS)))
    return img


def silhouettes(w, h, horizon, rng, tree_x, scale):
    """Returns (far hills, near ground with tombstones and a dead tree) as L masks."""
    SS = 2
    far = Image.new("L", (w * SS, h * SS), 0)
    near = Image.new("L", (w * SS, h * SS), 0)
    fd, nd = ImageDraw.Draw(far), ImageDraw.Draw(near)
    ph = [rng.uniform(0, math.tau) for _ in range(4)]

    def far_y(x):
        t = x / (w * SS)
        return horizon * SS - (math.sin(t * 5 + ph[0]) * 0.012 + math.sin(t * 13 + ph[1]) * 0.006 + 0.04) * h * SS

    def ground_y(x):
        t = x / (w * SS)
        return horizon * SS + (math.sin(t * 3 + ph[2]) * 0.01 + math.sin(t * 9 + ph[3]) * 0.004) * h * SS

    xs = range(0, w * SS + 8, 8)
    fd.polygon([(0, h * SS)] + [(x, far_y(x)) for x in xs] + [(w * SS, h * SS)], fill=255)
    nd.polygon([(0, h * SS)] + [(x, ground_y(x)) for x in xs] + [(w * SS, h * SS)], fill=255)

    unit = scale * SS
    for _ in range(max(8, int(w / (62 * scale)))):
        x = rng.uniform(0, w * SS)
        gy = ground_y(x) + rng.uniform(0, 0.06) * h * SS
        bw = rng.uniform(1.0, 1.9) * unit * 34
        bh = bw * rng.uniform(1.3, 1.9)
        kind = rng.choice(["round", "round", "cross", "slab"])
        lean = rng.uniform(-3.5, 3.5)
        shape = Image.new("L", (int(bw * 2), int(bh * 2.2)), 0)
        sd = ImageDraw.Draw(shape)
        cxs, bot = shape.width / 2, shape.height - 4
        if kind == "round":
            sd.rectangle((cxs - bw / 2, bot - bh, cxs + bw / 2, bot), fill=255)
            sd.ellipse((cxs - bw / 2, bot - bh - bw / 2, cxs + bw / 2, bot - bh + bw / 2), fill=255)
        elif kind == "slab":
            sd.rectangle((cxs - bw / 2, bot - bh, cxs + bw / 2, bot), fill=255)
        else:
            t = bw * 0.22
            sd.rectangle((cxs - t, bot - bh * 1.15, cxs + t, bot), fill=255)
            sd.rectangle((cxs - bw * 0.5, bot - bh * 0.85, cxs + bw * 0.5, bot - bh * 0.85 + t * 1.8), fill=255)
        shape = shape.rotate(lean, resample=Image.BICUBIC, center=(cxs, bot))
        near.paste(255, (int(x - cxs), int(gy - bot)), shape)

    def branch(x, y, ang, length, width, depth):
        if depth == 0 or length < 4 * SS:
            return
        x2, y2 = x + math.cos(ang) * length, y + math.sin(ang) * length
        nd.line((x, y, x2, y2), fill=255, width=max(1, int(width)))
        nd.ellipse((x2 - width / 2, y2 - width / 2, x2 + width / 2, y2 + width / 2), fill=255)
        for _ in range(rng.choice([2, 2, 3])):
            branch(x2, y2, ang + rng.uniform(-0.75, 0.75), length * rng.uniform(0.62, 0.8), width * 0.68, depth - 1)

    tx = tree_x * w * SS
    ty = ground_y(tx) + 10 * SS
    tree_h = 0.17 * h * SS
    branch(tx, ty, -math.pi / 2 + 0.05, tree_h * 0.45, tree_h * 0.075, 8)
    branch(tx, ty - tree_h * 0.12, -math.pi / 2 - 0.9, tree_h * 0.35, tree_h * 0.045, 6)

    return far.resize((w, h), Image.LANCZOS), near.resize((w, h), Image.LANCZOS)


def solid_with_mask(w, h, color, mask):
    layer = Image.new("RGBA", (w, h), color + (255,))
    layer.putalpha(mask)
    return layer


def scene(w, h, moon_x=0.5, moon_y=0.36, horizon=0.8, tree_x=0.14, seed=26):
    rng = random.Random(seed)
    unit = min(w, h * 0.75) / 1000
    img = night_background(w, h)
    stars(img, rng, int(w * h / 9000), h * horizon * 0.8, max(0.5, unit * 1.4))

    R = 0.5 * min(w * 0.62, h * 0.52)
    over(img, moon_layer(R), w * moon_x, h * moon_y)

    far, near = silhouettes(w, h, h * horizon, rng, tree_x, unit)
    img.alpha_composite(solid_with_mask(w, h, (30, 14, 36), far))

    fog = Image.new("L", (w, h), 0)
    ImageDraw.Draw(fog).rectangle((0, h * (horizon - 0.07), w, h * (horizon + 0.02)), fill=120)
    img.alpha_composite(solid_with_mask(w, h, (150, 110, 130), fog.filter(ImageFilter.GaussianBlur(h * 0.03))))

    img.alpha_composite(solid_with_mask(w, h, (8, 5, 13), near))

    low = Image.new("L", (w, h), 0)
    ImageDraw.Draw(low).rectangle((0, h * (horizon + 0.03), w, h), fill=255)
    low = low.filter(ImageFilter.GaussianBlur(h * 0.05)).point(lambda v: int(v * 0.85))
    img.alpha_composite(solid_with_mask(w, h, NIGHT_950, low))

    vignette(img, 0.45)
    return img


def wordmark(text_w, subtitle=True):
    """Red-gradient HALLOW with blood drips; `text_w` is the lettering width."""
    font = ImageFont.truetype(CREEPSTER, 360)
    stroke = 16
    bbox = font.getbbox("HALLOW", stroke_width=stroke)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 140
    W, H = tw + pad * 2, th + (330 if subtitle else 210) + pad * 2
    origin = (pad - bbox[0], pad - bbox[1])

    fill_mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(fill_mask).text(origin, "HALLOW", font=font, fill=255)
    outline = Image.new("L", (W, H), 0)
    ImageDraw.Draw(outline).text(origin, "HALLOW", font=font, fill=255, stroke_width=stroke)

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.alpha_composite(solid_with_mask(W, H, BLOOD_500, outline.filter(ImageFilter.GaussianBlur(26)).point(lambda v: int(v * 0.55))))

    # drips go under the outline so they look like they ooze out from behind the lettering
    d = ImageDraw.Draw(img)
    rng = random.Random(13)
    for f in (0.1, 0.24, 0.4, 0.55, 0.7, 0.83, 0.94):
        x = int(pad + f * tw)
        col = fill_mask.crop((x, 0, x + 1, H)).getbbox()
        if not col:
            continue
        ybot = col[3]
        if fill_mask.crop((x - 16, ybot - 40, x + 16, ybot - 30)).getextrema()[0] < 255:
            continue
        ln = rng.randint(50, 150)
        wd = rng.randint(14, 22)
        d.polygon([(x - wd, ybot - 2), (x + wd, ybot - 2), (x + wd * 0.45, ybot + ln), (x - wd * 0.45, ybot + ln)],
                  fill=(91, 5, 5, 255))
        d.ellipse((x - wd * 0.8, ybot + ln - wd * 0.6, x + wd * 0.8, ybot + ln + wd * 1.2), fill=(91, 5, 5, 255))
        d.ellipse((x - wd * 0.4, ybot + ln - wd * 0.2, x - wd * 0.1, ybot + ln + wd * 0.4), fill=(179, 15, 15, 255))

    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        t = min(1, max(0, (y - (pad - 10)) / max(1, th)))
        if t < 0.45:
            c = lerp((255, 77, 77), (209, 26, 26), t / 0.45)
        else:
            c = lerp((209, 26, 26), (122, 8, 8), (t - 0.45) / 0.55)
        gd.line((0, y, W, y), fill=c + (255,))
    grad.putalpha(fill_mask)
    img.alpha_composite(grad)

    d = ImageDraw.Draw(img)
    if subtitle:
        label = "SIX RITES BEFORE DAWN"
        track = 12
        size = 92
        while True:
            sf = ImageFont.truetype(FELL, size)
            widths = [sf.getlength(c) + track for c in label]
            if sum(widths) - track <= tw or size < 30:
                break
            size -= 2
        x = (W - (sum(widths) - track)) / 2
        y = pad + th + 210
        for c, cw in zip(label, widths):
            d.text((x + 3, y + 3), c, font=sf, fill=(0, 0, 0, 230))
            d.text((x, y), c, font=sf, fill=BONE_200 + (255,))
            x += cw

    s = text_w / tw
    return img.resize((max(1, int(W * s)), max(1, int(H * s))), Image.LANCZOS)


def cover(img, w, h):
    return ImageOps.fit(img, (w, h), Image.LANCZOS, centering=(0.5, 0.5))


def save(img, path, opaque=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB" if opaque else "RGBA").save(path, optimize=True)


def with_wordmark(img, text_w, center_y, center_x=0.5, subtitle=True):
    m = wordmark(text_w, subtitle)
    img.alpha_composite(m, (int(img.width * center_x - m.width / 2), int(img.height * center_y - m.height * 0.42)))
    return img


def main():
    print("rendering masters...")
    portrait = scene(2304, 3072, tree_x=0.22)
    master_icon = icon(1024)
    master_fg = icon(1024, transparent=True, safe=1.0)

    print("iOS...")
    ios_icons = {
        "icon-1024": 1024, "icon-20": 20, "icon-20@2x": 40, "icon-20@3x": 60, "icon-29": 29, "icon-29@2x": 58,
        "icon-29@3x": 87, "icon-40": 40, "icon-40@2x": 80, "icon-40@3x": 120, "icon-60@2x": 120,
        "icon-60@3x": 180, "icon-76": 76, "icon-76@2x": 152, "icon-83.5@2x": 167,
    }
    for name, px in ios_icons.items():
        save(master_icon.resize((px, px), Image.LANCZOS), IOS / "AppIcon.appiconset" / f"{name}.png", opaque=True)
    for suffix, k in (("", 1), ("@2x", 2), ("@3x", 3)):
        save(cover(portrait, 768 * k, 1024 * k),
             IOS / "LaunchScreen.AspectFill.imageset" / f"LaunchScreen-AspectFill{suffix}.png", opaque=True)
        m = wordmark(260 * k)
        canvas = Image.new("RGBA", (390 * k, m.height), (0, 0, 0, 0))
        canvas.alpha_composite(m, ((390 * k - m.width) // 2, 0))
        save(canvas, IOS / "LaunchScreen.Center.imageset" / f"LaunchScreen-Center{suffix}.png")
        if k == 1:
            print("iOS center image size:", canvas.size)

    print("Android...")
    for name, k in {"ldpi": 0.75, "mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
        save(cover(portrait, int(360 * k), int(592 * k)), ANDROID / f"drawable-{name}" / "background.png", opaque=True)
        save(wordmark(int(220 * k)), ANDROID / f"drawable-{name}" / "logo.png")
    for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        save(icon(px * 2, safe=0.92, rounded=0.2).resize((px, px), Image.LANCZOS),
             ANDROID / f"mipmap-{name}" / "ic_launcher.png")
        fg_px = int(px * 108 / 48)
        save(icon(fg_px * 2, transparent=True, safe=0.6).resize((fg_px, fg_px), Image.LANCZOS),
             ANDROID / f"drawable-{name}" / "ic_launcher_foreground.png")

    print("Windows...")
    landscape = with_wordmark(scene(2480, 1200, moon_y=0.44, horizon=0.84, tree_x=0.1), 760, 0.5)
    scales = {"": 1, ".scale-125": 1.25, ".scale-150": 1.5, ".scale-200": 2, ".scale-400": 4}
    for suf, k in scales.items():
        for base, px in {"Square150x150Logo": 150, "Square44x44Logo": 44, "StoreLogo": 50, "icon": 48}.items():
            n = round(px * k)
            save(master_icon.resize((n, n), Image.LANCZOS), WIN / f"{base}{suf}.png", opaque=True)
        for base in ("Square44x44Logo.targetsize-24_altform-unplated", "LockScreenLogo"):
            n = round(24 * k)
            save(master_fg.resize((n, n), Image.LANCZOS), WIN / f"{base}{suf}.png")
        save(cover(landscape, round(620 * k), round(300 * k)), WIN / f"SplashScreen{suf}.png", opaque=True)
        save(cover(landscape, round(310 * k), round(150 * k)), WIN / f"Wide310x150Logo{suf}.png", opaque=True)

    print("docs...")
    banner = with_wordmark(scene(2400, 960, moon_x=0.76, moon_y=0.4, horizon=0.84, tree_x=0.04), 1100, 0.46, center_x=0.36)
    save(banner, DOCS / "banner.png", opaque=True)
    save(cover(banner, 1280, 640), DOCS / "social-preview.png", opaque=True)
    save(master_icon.resize((512, 512), Image.LANCZOS), DOCS / "icon.png", opaque=True)


if __name__ == "__main__":
    main()
