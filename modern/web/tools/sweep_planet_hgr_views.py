#!/usr/bin/env python3
"""
Generate source-backed contact sheets for Space Vikings planet HGR renders
while sweeping view-state bytes such as pitch, bank, and heading.
"""

from __future__ import annotations

import math
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_planet_hgr_from_cpu import (  # noqa: E402
    HGR_PAGE1_LEN,
    HGR_PAGE2_START,
    CPU6502,
    apply_reentry_seed,
    extract_page,
    load_standard_binaries,
    run_subroutine,
    run_starship_frame,
    run_starship_frames,
)

HGR_WIDTH = 280
HGR_HEIGHT = 192
HGR_BYTES_PER_ROW = 40


def parse_values(spec: str) -> list[int]:
    values: list[int] = []
    for token in spec.split(","):
        token = token.strip()
        if not token:
            continue
        if ":" in token:
            parts = [part.strip() for part in token.split(":")]
            if len(parts) not in (2, 3):
                raise ValueError(f"bad range token: {token}")
            start = int(parts[0], 0)
            end = int(parts[1], 0)
            step = int(parts[2], 0) if len(parts) == 3 else 1
            if step == 0:
                raise ValueError("step cannot be zero")
            if start <= end:
                current = start
                while current <= end:
                    values.append(current & 0xFF)
                    current += abs(step)
            else:
                current = start
                while current >= end:
                    values.append(current & 0xFF)
                    current -= abs(step)
        else:
            values.append(int(token, 0) & 0xFF)
    if not values:
        raise ValueError("no values parsed")
    return values


def apple2_hgr_row_offset(y: int) -> int:
    return ((y & 0x07) << 10) + ((y & 0x38) << 4) + ((y & 0xC0) >> 6) * HGR_BYTES_PER_ROW


def decode_hgr_page(page_bytes: list[int]) -> Image.Image:
    img = Image.new("1", (HGR_WIDTH, HGR_HEIGHT), 0)
    px = img.load()
    for y in range(HGR_HEIGHT):
        row_base = apple2_hgr_row_offset(y)
        for column in range(HGR_BYTES_PER_ROW):
            value = page_bytes[row_base + column] if row_base + column < len(page_bytes) else 0
            x_base = column * 7
            for bit in range(7):
                if value & (1 << bit):
                    x = x_base + bit
                    if x < HGR_WIDTH:
                        px[x, y] = 1
    return img


def run_view(
    planet_index: int,
    *,
    state_x: int,
    state_y: int,
    coord_y: int | None,
    pitch: int,
    bank: int,
    heading: int,
    surface_clamp: bool,
    full_frame: bool,
    frame_count: int,
) -> tuple[Image.Image, dict]:
    cpu = CPU6502()
    load_standard_binaries(cpu, planet_index)
    apply_reentry_seed(cpu, planet_index)
    cpu.memory[0x95FD] = state_x & 0xFF
    cpu.memory[0x95FE] = state_y & 0xFF
    if surface_clamp:
        cpu.memory[0x731D] = 20
        cpu.memory[0x731E] = 0
        cpu.memory[0x7321] = 0
        cpu.memory[0x7322] = 0
    if coord_y is not None:
        value = coord_y & 0xFFFF
        cpu.memory[0x731D] = value & 0xFF
        cpu.memory[0x731E] = (value >> 8) & 0xFF
    cpu.memory[0x7321] = pitch & 0xFF
    cpu.memory[0x7322] = bank & 0xFF
    cpu.memory[0x7323] = heading & 0xFF

    if full_frame:
        result = run_starship_frames(cpu, frame_count)
    else:
        result = run_subroutine(cpu, 0x9023)
    page1 = extract_page(cpu, 0x2000)
    page2 = extract_page(cpu, HGR_PAGE2_START)
    page1_nonzero = sum(1 for value in page1 if value)
    page2_nonzero = sum(1 for value in page2 if value)
    chosen = page2 if page2_nonzero >= page1_nonzero else page1
    image = decode_hgr_page(chosen).convert("L")
    meta = {
        "completed": result["ok"],
        "steps": result["steps"],
        "unknown": result["unknown"],
        "page1_nonzero": page1_nonzero,
        "page2_nonzero": page2_nonzero,
        "video_page": "page2" if page2_nonzero >= page1_nonzero else "page1",
    }
    return image, meta


def chunked(items: list[tuple[int, int, int]], size: int) -> Iterable[list[tuple[int, int, int]]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--planet", type=int, default=6)
    parser.add_argument("--state-x", type=lambda value: int(value, 0), default=0x30)
    parser.add_argument("--state-y", type=lambda value: int(value, 0), default=0x10)
    parser.add_argument("--state-x-values")
    parser.add_argument("--state-y-values")
    parser.add_argument("--coord-y", type=lambda value: int(value, 0))
    parser.add_argument("--surface-clamp", action="store_true")
    parser.add_argument("--pitch-values", default="0,32,64,96,128,160,192,224")
    parser.add_argument("--bank-values", default="0")
    parser.add_argument("--heading-values", default="20")
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--full-frame", action="store_true")
    parser.add_argument("--frame-count", type=int, default=1)
    parser.add_argument("--out", default="modern/web/tools/screenshots/planet-view-sweep.png")
    args = parser.parse_args()

    pitches = parse_values(args.pitch_values)
    banks = parse_values(args.bank_values)
    headings = parse_values(args.heading_values)
    state_x_values = parse_values(args.state_x_values) if args.state_x_values else [args.state_x]
    state_y_values = parse_values(args.state_y_values) if args.state_y_values else [args.state_y]

    combinations = [
        (state_x, state_y, pitch, bank, heading)
        for state_x in state_x_values
        for state_y in state_y_values
        for pitch in pitches
        for bank in banks
        for heading in headings
    ]
    cell_w = HGR_WIDTH + 16
    cell_h = HGR_HEIGHT + 40
    rows = math.ceil(len(combinations) / args.columns)
    sheet = Image.new("RGB", (args.columns * cell_w, rows * cell_h), "black")
    draw = ImageDraw.Draw(sheet)

    for index, (state_x, state_y, pitch, bank, heading) in enumerate(combinations):
        image, meta = run_view(
            args.planet,
            state_x=state_x,
            state_y=state_y,
            coord_y=args.coord_y,
            pitch=pitch,
            bank=bank,
            heading=heading,
            surface_clamp=args.surface_clamp,
            full_frame=args.full_frame,
            frame_count=args.frame_count,
        )
        row = index // args.columns
        col = index % args.columns
        x = col * cell_w + 8
        y = row * cell_h + 8
        sheet.paste(Image.merge("RGB", (image, image, image)), (x, y))
        label = (
            f"X={state_x:02X} Y={state_y:02X} P={pitch:02X} B={bank:02X} H={heading:02X}\n"
            f"{meta['video_page']} nz:{meta['page2_nonzero'] if meta['video_page']=='page2' else meta['page1_nonzero']}"
        )
        draw.text((x, y + HGR_HEIGHT + 6), label, fill=(0, 255, 0))

    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main()
