#!/usr/bin/env python3
"""Generate Android launcher PNGs from the Q-style icon master geometry."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], amount: float):
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def draw_icon(size: int, round_icon: bool) -> Image.Image:
    scale = size / 1024
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    background = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = background.load()
    for y in range(size):
        for x in range(size):
            amount = (x + y) / max(1, 2 * (size - 1))
            pixels[x, y] = (*lerp((83, 105, 214), (32, 41, 95), amount), 255)
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    box = (round(32 * scale),) * 2 + (round(992 * scale),) * 2
    if round_icon:
        mask_draw.ellipse(box, fill=255)
    else:
        mask_draw.rounded_rectangle(box, radius=round(250 * scale), fill=255)
    image.alpha_composite(Image.composite(background, Image.new("RGBA", (size, size)), mask))
    draw = ImageDraw.Draw(image)

    def xy(values):
        return tuple(round(value * scale) for value in values)

    outline = "#452A50"
    draw.ellipse(xy((207, 772, 817, 868)), fill="#161B43", width=0)
    draw.polygon([xy(point) for point in ((420, 223), (463, 135), (516, 189), (571, 116), (605, 197), (666, 150), (685, 246), (398, 246))], fill="#FFD65A", outline=outline, width=max(1, round(18 * scale)))
    body = xy((214, 234, 810, 815))
    draw.rounded_rectangle(body, radius=round(148 * scale), fill="#F58945", outline=outline, width=max(1, round(20 * scale)))
    draw.rounded_rectangle(xy((301, 319, 723, 560)), radius=round(68 * scale), fill=outline)
    draw.rounded_rectangle(xy((326, 344, 698, 535)), radius=round(48 * scale), fill="#FFF3C6")
    for cx in (442, 582):
        draw.ellipse(xy((cx - 24, 406, cx + 24, 454)), fill=outline)
    for cx in (399, 625):
        draw.ellipse(xy((cx - 17, 465, cx + 17, 499)), fill="#F07868")
    draw.polygon([xy(point) for point in ((512, 448), (526, 471), (554, 475), (534, 495), (539, 523), (512, 510), (485, 523), (490, 495), (470, 475), (498, 471))], fill="#5C79DF")
    draw.rounded_rectangle(xy((278, 626, 340, 804)), radius=round(27 * scale), fill=outline)
    draw.rounded_rectangle(xy((220, 684, 398, 746)), radius=round(27 * scale), fill=outline)
    draw.ellipse(xy((614, 628, 710, 724)), fill="#F84563", outline=outline, width=max(1, round(15 * scale)))
    draw.ellipse(xy((706, 704, 790, 788)), fill="#69C5D5", outline=outline, width=max(1, round(15 * scale)))
    draw.ellipse(xy((637, 648, 661, 672)), fill="#FFB5B1")
    draw.ellipse(xy((726, 723, 746, 743)), fill="#D8FFFF")
    for cx in (391, 633):
        draw.ellipse(xy((cx - 28, 783, cx + 28, 839)), fill="#FFD65A", outline=outline, width=max(1, round(14 * scale)))
    return image


def main() -> None:
    for folder, size in SIZES.items():
        target = RES / folder
        target.mkdir(parents=True, exist_ok=True)
        draw_icon(size, False).save(target / "ic_launcher.png", optimize=True)
        draw_icon(size, True).save(target / "ic_launcher_round.png", optimize=True)


if __name__ == "__main__":
    main()
