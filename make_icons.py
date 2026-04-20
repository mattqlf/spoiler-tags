from PIL import Image, ImageDraw, ImageFilter
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SIZES = [16, 32, 48, 128]

BG = (37, 41, 56, 255)          # deep slate
BAR_BLUR = (200, 200, 210, 255)  # light, will be blurred
ACCENT = (122, 162, 247, 255)    # soft blue accent


def render(size: int) -> Image.Image:
    scale = 8 if size < 128 else 4
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(S * 0.22)
    d.rounded_rectangle([(0, 0), (S, S)], radius=radius, fill=BG)

    pad_x = int(S * 0.16)
    bar_h = int(S * 0.11)
    gap = int(S * 0.09)
    top = int(S * 0.28)

    widths = [S - 2 * pad_x, int((S - 2 * pad_x) * 0.78), int((S - 2 * pad_x) * 0.55)]
    bar_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar_layer)
    y = top
    for w in widths:
        bd.rounded_rectangle(
            [(pad_x, y), (pad_x + w, y + bar_h)],
            radius=bar_h // 2,
            fill=BAR_BLUR,
        )
        y += bar_h + gap

    blur_radius = max(3, int(S * 0.025))
    bar_layer = bar_layer.filter(ImageFilter.GaussianBlur(blur_radius))
    img = Image.alpha_composite(img, bar_layer)

    dot_r = int(S * 0.055)
    dot_cx = S - pad_x - int(S * 0.02)
    dot_cy = top + bar_h // 2
    d2 = ImageDraw.Draw(img)
    d2.ellipse(
        [(dot_cx - dot_r, dot_cy - dot_r), (dot_cx + dot_r, dot_cy + dot_r)],
        fill=ACCENT,
    )

    return img.resize((size, size), Image.LANCZOS)


for s in SIZES:
    render(s).save(os.path.join(OUT_DIR, f"icon{s}.png"))
    print(f"wrote icon{s}.png")
