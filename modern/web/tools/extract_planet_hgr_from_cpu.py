#!/usr/bin/env python3
"""
Render Space Vikings planet payloads through the original $6000 graphics module.
This is an offline source-backed extractor, not a gameplay/runtime replacement.
"""

from __future__ import annotations

import json
import sys
from argparse import ArgumentParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from emulator.cpu6502 import CPU6502  # noqa: E402

HGR_PAGE1_START = 0x2000
HGR_PAGE2_START = 0x4000
HGR_PAGE1_LEN = 0x2000
RETURN_SENTINEL = 0x0200
MEM_TRANSFER_PAGE1 = 0x9400
MEM_TRANSFER_PAGE2 = 0x9430
SPACE_SIM_ENTRY = 0x9023


def load_standard_binaries(cpu: CPU6502, planet_index: int) -> None:
    cpu.load_binary(str(ROOT / "extracted" / "LO-HI A2-3D1.payload.bin"), 0x6000)
    cpu.load_binary(str(ROOT / "extracted" / "PLANET FILE-M.payload.bin"), 0x954C)
    cpu.load_binary(str(ROOT / "extracted" / "P_F-M.payload.bin"), 0x97E1)
    cpu.load_binary(str(ROOT / "extracted" / "SHIP'S DATA-M.payload.bin"), 0x9506)
    cpu.load_binary(str(ROOT / "extracted" / "SPACE SIMULATOR ASSEMBLY.payload.bin"), 0x9023)
    cpu.load_binary(str(ROOT / "extracted" / "MEM DATA.payload.bin"), 0x8BEC)
    cpu.load_binary(str(ROOT / "extracted" / f"PLANET no {planet_index}.payload.bin"), 0x7300)


def apply_reentry_seed(cpu: CPU6502, planet_index: int) -> None:
    # RE.bas lines 25-37 seed the loaded PLANET #n payload before returning
    # to STARSHIP SIMULATOR. Running $9023 from raw zeroed payload state only
    # exercises the renderer with meaningless defaults.
    cpu.memory[0x9541] = planet_index  # 38209 current planet index
    cpu.memory[0x9542] = 1             # 38210 atmosphere / reentry flag
    cpu.memory[0x731B] = 188  # XI low
    cpu.memory[0x731C] = cpu.memory[0x731C]  # XI high preserved from payload/save
    cpu.memory[0x731D] = 0    # YI low
    cpu.memory[0x731E] = 4    # YI high
    cpu.memory[0x731F] = 168  # ZI low
    cpu.memory[0x7320] = 228  # ZI high
    cpu.memory[0x7321] = cpu.memory[0x7321]  # pitch preserved from payload/save
    cpu.memory[0x7322] = cpu.memory[0x7322]  # bank preserved from payload/save
    cpu.memory[0x7323] = 20   # heading
    cpu.memory[0x952F] = 0    # auxiliary branch state used by $90F3+


def run_subroutine(cpu: CPU6502, entry: int, max_steps: int = 300000) -> dict:
    cpu.memory[RETURN_SENTINEL] = 0x00
    cpu.memory[0xFFFE] = 0x00
    cpu.memory[0xFFFF] = 0x00
    cpu.SP = 0xFD
    cpu.push16(RETURN_SENTINEL - 1)
    cpu.PC = entry

    steps = 0
    unknown = 0
    while steps < max_steps:
        opcode = cpu.memory[cpu.PC]
        if cpu.PC == RETURN_SENTINEL:
            return {"steps": steps, "unknown": unknown, "ok": True}
        if opcode not in cpu.opcodes:
            unknown += 1
            cpu.PC = (cpu.PC + 1) & 0xFFFF
            steps += 1
            continue
        cpu.step()
        steps += 1

    return {"steps": steps, "unknown": unknown, "ok": False}


def run_starship_frame(cpu: CPU6502, max_steps: int = 300000) -> dict:
    total_steps = 0
    total_unknown = 0
    completed = True

    for oo in (0, 1):
        op = abs(oo - 1)
        cpu.memory[0x7315] = (84 + oo) & 0xFF
        cpu.memory[0x7317] = op & 0xFF
        cpu.memory[0x7319] = op & 0xFF

        if cpu.memory[0x9542] == 1:
            speed = cpu.memory[0x951D]
            y_value = cpu.memory[0x731D] | (cpu.memory[0x731E] << 8)
            y_value = (y_value - (6 - (speed / 10))) if y_value < 0x8000 else y_value
            if y_value < 20:
                y_value = 20
                cpu.memory[0x7321] = 0
                cpu.memory[0x7322] = 0
            y_value = int(y_value) & 0xFFFF
            cpu.memory[0x731D] = y_value & 0xFF
            cpu.memory[0x731E] = (y_value >> 8) & 0xFF

        result = run_subroutine(cpu, SPACE_SIM_ENTRY, max_steps=max_steps)
        total_steps += result["steps"]
        total_unknown += result["unknown"]
        completed = completed and result["ok"]

        cpu.memory[0x03CE] = 32 if oo == 1 else 64
        transfer = MEM_TRANSFER_PAGE2 if oo == 1 else MEM_TRANSFER_PAGE1
        transfer_result = run_subroutine(cpu, transfer, max_steps=max_steps)
        total_steps += transfer_result["steps"]
        total_unknown += transfer_result["unknown"]
        completed = completed and transfer_result["ok"]

    return {"steps": total_steps, "unknown": total_unknown, "ok": completed}


def run_starship_frames(cpu: CPU6502, frame_count: int, max_steps: int = 300000) -> dict:
    total_steps = 0
    total_unknown = 0
    completed = True
    for _ in range(max(1, frame_count)):
        result = run_starship_frame(cpu, max_steps=max_steps)
        total_steps += result["steps"]
        total_unknown += result["unknown"]
        completed = completed and result["ok"]
    return {"steps": total_steps, "unknown": total_unknown, "ok": completed}


def extract_page(cpu: CPU6502, start: int) -> list[int]:
    return list(cpu.memory[start:start + HGR_PAGE1_LEN])


def write_output(
    planet_index: int,
    mode: str,
    result: dict,
    page1_bytes: list[int],
    page2_bytes: list[int],
) -> Path:
    out_dir = ROOT / "modern" / "web" / "public" / "data" / "debug"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"planet-{planet_index}-{mode}-hgr.json"
    page1_nonzero = sum(1 for value in page1_bytes if value)
    page2_nonzero = sum(1 for value in page2_bytes if value)
    payload = {
        "planetIndex": planet_index,
        "mode": mode,
        "entry": "$6000" if mode == "direct6000" else "$9023",
        "steps": result["steps"],
        "unknownOpcodesSkipped": result["unknown"],
        "completed": result["ok"],
        "page1": page1_bytes,
        "page2": page2_bytes,
        "page1NonZeroBytes": page1_nonzero,
        "page2NonZeroBytes": page2_nonzero,
        "videoPageHint": "page2" if page2_nonzero > page1_nonzero else "page1",
    }
    out_path.write_text(json.dumps(payload))
    return out_path


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("planet_index", type=int, nargs="?", default=1)
    parser.add_argument("--state-x", type=lambda value: int(value, 0), default=0x5A)
    parser.add_argument("--state-y", type=lambda value: int(value, 0), default=0x5A)
    parser.add_argument("--mode-suffix", default="")
    parser.add_argument("--surface-clamp", action="store_true")
    parser.add_argument("--coord-y", type=lambda value: int(value, 0))
    parser.add_argument("--pitch", type=lambda value: int(value, 0))
    parser.add_argument("--bank", type=lambda value: int(value, 0))
    parser.add_argument("--heading", type=lambda value: int(value, 0))
    parser.add_argument("--full-frame", action="store_true")
    parser.add_argument("--frame-count", type=int, default=1)
    args = parser.parse_args()

    for base_mode, entry in (("direct6000", 0x6000), ("state9023", 0x9023)):
        mode = f"{base_mode}{args.mode_suffix}"
        cpu = CPU6502()
        load_standard_binaries(cpu, args.planet_index)
        apply_reentry_seed(cpu, args.planet_index)
        cpu.memory[0x95FD] = args.state_x
        cpu.memory[0x95FE] = args.state_y
        if args.surface_clamp:
            cpu.memory[0x731D] = 20
            cpu.memory[0x731E] = 0
            cpu.memory[0x7321] = 0
            cpu.memory[0x7322] = 0
        if args.coord_y is not None:
            value = args.coord_y & 0xFFFF
            cpu.memory[0x731D] = value & 0xFF
            cpu.memory[0x731E] = (value >> 8) & 0xFF
        if args.pitch is not None:
            cpu.memory[0x7321] = args.pitch & 0xFF
        if args.bank is not None:
            cpu.memory[0x7322] = args.bank & 0xFF
        if args.heading is not None:
            cpu.memory[0x7323] = args.heading & 0xFF
        result = (
            run_starship_frames(cpu, args.frame_count)
            if args.full_frame and entry == SPACE_SIM_ENTRY
            else run_subroutine(cpu, entry)
        )
        page1_bytes = extract_page(cpu, HGR_PAGE1_START)
        page2_bytes = extract_page(cpu, HGR_PAGE2_START)
        out_path = write_output(args.planet_index, mode, result, page1_bytes, page2_bytes)
        page1_nonzero = sum(1 for value in page1_bytes if value)
        page2_nonzero = sum(1 for value in page2_bytes if value)
        page_hint = "page2" if page2_nonzero > page1_nonzero else "page1"
        print(
            f"{mode}: completed={result['ok']} steps={result['steps']} unknown={result['unknown']} "
            f"page1={page1_nonzero} page2={page2_nonzero} hint={page_hint} "
            f"stateX={args.state_x:02X} stateY={args.state_y:02X} -> {out_path}"
        )


if __name__ == "__main__":
    main()
