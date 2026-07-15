#!/usr/bin/env python3
"""
Trace the original A2-3D1 entry at $6000 for Space Vikings.

This stays on the source path: it seeds the same simulator state used by the
extractors, advances through the original SPACE SIMULATOR entry until A2-3D1 is
reached, then records control flow, payload reads, and HGR writes from there.
"""

from __future__ import annotations

import json
import sys
from argparse import ArgumentParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_planet_hgr_from_cpu import (  # noqa: E402
    CPU6502,
    SPACE_SIM_ENTRY,
    apply_reentry_seed,
    load_standard_binaries,
)

HGR_START = 0x2000
HGR_END = 0x5FFF
PAYLOAD_START = 0x7300
PAYLOAD_END = 0x73FF
RETURN_SENTINEL = 0x0200

READ_OPS_IMM = {
    0xA9, 0xA2, 0xA0, 0xC9, 0xE0, 0xC0, 0x69, 0xE9, 0x29, 0x49, 0x09,
}
READ_OPS_ZP = {
    0xA5, 0xA6, 0xA4, 0xC5, 0xE4, 0xC4, 0x65, 0xE5, 0x25, 0x45, 0x05, 0x24,
}
READ_OPS_ZPX = {0xB5, 0x15, 0x35, 0x55, 0x75, 0xD5, 0xF5, 0xB4}
READ_OPS_ZPY = {0xB6}
READ_OPS_INDX = {0xA1}
READ_OPS_INDY = {0x11, 0x31, 0x51, 0x71, 0xB1, 0xD1, 0xF1}
READ_OPS_ABS = {
    0xAD, 0xAE, 0xAC, 0xCD, 0xEC, 0xCC, 0x6D, 0xED, 0x2D, 0x4D, 0x0D, 0x2C,
}
READ_OPS_ABSX = {0xBD, 0xBC, 0x1D, 0x3D, 0x5D, 0x7D, 0xDD, 0xFD}
READ_OPS_ABSY = {0xBE, 0xB9, 0x19, 0x39, 0x59, 0x79, 0xD9, 0xF9}
WRITE_OPS = {
    0x85, 0x86, 0x84, 0x95, 0x96, 0x94, 0x8D, 0x8E, 0x8C, 0x9D, 0x99, 0x91,
    0x06, 0x26, 0x66, 0xE6, 0x46, 0xC6, 0xEE, 0xCE,
}
FLOW_JSR = {0x20}
FLOW_JMP = {0x4C, 0x6C}
FLOW_RTS = {0x60}
FLOW_RTI = {0x40}


def push_return_sentinel(cpu: CPU6502, entry: int) -> None:
    cpu.memory[RETURN_SENTINEL] = 0x00
    cpu.memory[0xFFFE] = 0x00
    cpu.memory[0xFFFF] = 0x00
    cpu.SP = 0xFD
    cpu.push16(RETURN_SENTINEL - 1)
    cpu.PC = entry


def run_until_pc(cpu: CPU6502, target_pc: int, max_steps: int = 400000) -> dict:
    steps = 0
    unknown = 0
    while steps < max_steps:
        if cpu.PC == target_pc:
            return {"ok": True, "steps": steps, "unknown": unknown}
        opcode = cpu.memory[cpu.PC]
        if opcode not in cpu.opcodes:
            unknown += 1
            cpu.PC = (cpu.PC + 1) & 0xFFFF
            steps += 1
            continue
        cpu.step()
        steps += 1
    return {"ok": False, "steps": steps, "unknown": unknown}


def describe_target(cpu: CPU6502, pc: int, opcode: int) -> int | None:
    if opcode == 0x20 or opcode == 0x4C:
        return cpu.memory[pc + 1] | (cpu.memory[pc + 2] << 8)
    if opcode == 0x6C:
        ptr = cpu.memory[pc + 1] | (cpu.memory[pc + 2] << 8)
        lo = cpu.memory[ptr]
        hi = cpu.memory[(ptr + 1) & 0xFFFF]
        return lo | (hi << 8)
    return None


def read_addresses(cpu: CPU6502, pc: int, opcode: int) -> list[int]:
    if opcode in READ_OPS_IMM:
        return []
    if opcode in READ_OPS_ZP:
        return [cpu.memory[pc + 1]]
    if opcode in READ_OPS_ZPX:
        return [((cpu.memory[pc + 1] + cpu.X) & 0xFF)]
    if opcode in READ_OPS_ZPY:
        return [((cpu.memory[pc + 1] + cpu.Y) & 0xFF)]
    if opcode in READ_OPS_INDX:
        zp = (cpu.memory[pc + 1] + cpu.X) & 0xFF
        addr = cpu.memory[zp] | (cpu.memory[(zp + 1) & 0xFF] << 8)
        return [addr]
    if opcode in READ_OPS_INDY:
        zp = cpu.memory[pc + 1]
        addr = cpu.memory[zp] | (cpu.memory[(zp + 1) & 0xFF] << 8)
        return [((addr + cpu.Y) & 0xFFFF)]
    if opcode in READ_OPS_ABS:
        return [cpu.memory[pc + 1] | (cpu.memory[pc + 2] << 8)]
    if opcode in READ_OPS_ABSX:
        base = cpu.memory[pc + 1] | (cpu.memory[pc + 2] << 8)
        return [((base + cpu.X) & 0xFFFF)]
    if opcode in READ_OPS_ABSY:
        base = cpu.memory[pc + 1] | (cpu.memory[pc + 2] << 8)
        return [((base + cpu.Y) & 0xFFFF)]
    return []


def write_addresses(cpu: CPU6502, pc: int, opcode: int) -> list[int]:
    if opcode not in WRITE_OPS:
        return []
    current_pc = cpu.PC
    cpu.PC = pc
    try:
        return [cpu._get_address()]  # noqa: SLF001
    finally:
        cpu.PC = current_pc


def snapshot_state(cpu: CPU6502) -> dict[str, int]:
    return {
        "A": cpu.A,
        "X": cpu.X,
        "Y": cpu.Y,
        "PC": cpu.PC,
        "SP": cpu.SP,
        "P": cpu.P,
        "stateX": cpu.memory[0x95FD],
        "stateY": cpu.memory[0x95FE],
        "flag952F": cpu.memory[0x952F],
        "o7315": cpu.memory[0x7315],
        "o7317": cpu.memory[0x7317],
        "o7319": cpu.memory[0x7319],
        "pitch": cpu.memory[0x7321],
        "bank": cpu.memory[0x7322],
        "heading": cpu.memory[0x7323],
    }


def trace_from_6000(cpu: CPU6502, max_steps: int) -> dict:
    steps = 0
    unknown = 0
    flow: list[dict] = []
    payload_reads: list[dict] = []
    payload_writes: list[dict] = []
    hgr_writes: list[dict] = []
    mode_branches: list[dict] = []
    visited_counts: dict[int, int] = {}

    while steps < max_steps:
        pc = cpu.PC
        if pc == RETURN_SENTINEL:
            break
        opcode = cpu.memory[pc]
        if opcode not in cpu.opcodes:
            unknown += 1
            cpu.PC = (cpu.PC + 1) & 0xFFFF
            steps += 1
            continue

        visited_counts[pc] = visited_counts.get(pc, 0) + 1
        reads = read_addresses(cpu, pc, opcode)
        writes = write_addresses(cpu, pc, opcode)
        target = describe_target(cpu, pc, opcode)
        before = snapshot_state(cpu)

        if opcode in FLOW_JSR | FLOW_JMP | FLOW_RTS | FLOW_RTI:
            flow.append(
                {
                    "step": steps,
                    "pc": f"{pc:04X}",
                    "opcode": f"{opcode:02X}",
                    "target": f"{target:04X}" if target is not None else None,
                    "A": before["A"],
                    "X": before["X"],
                    "Y": before["Y"],
                    "pitch": before["pitch"],
                    "bank": before["bank"],
                    "heading": before["heading"],
                }
            )
        if pc == 0x6979 and opcode == 0xA5:
            mode_branches.append(
                {
                    "step": steps,
                    "mode6E": f"{cpu.memory[0x6E]:02X}",
                    "mode66": f"{cpu.memory[0x66]:02X}",
                    "pitch": f"{cpu.memory[0x7321]:02X}",
                    "bank": f"{cpu.memory[0x7322]:02X}",
                    "heading": f"{cpu.memory[0x7323]:02X}",
                }
            )

        for addr in reads:
            if PAYLOAD_START <= addr <= PAYLOAD_END:
                payload_reads.append(
                    {
                        "step": steps,
                        "pc": f"{pc:04X}",
                        "opcode": f"{opcode:02X}",
                        "addr": f"{addr:04X}",
                        "value": f"{cpu.memory[addr]:02X}",
                    }
                )

        old_values = {addr: cpu.memory[addr] for addr in writes}
        cpu.step()
        steps += 1

        for addr in writes:
            new_value = cpu.memory[addr]
            if addr >= PAYLOAD_START and addr <= PAYLOAD_END:
                if new_value != old_values[addr]:
                    payload_writes.append(
                        {
                            "step": steps,
                            "pc": f"{pc:04X}",
                            "opcode": f"{opcode:02X}",
                            "addr": f"{addr:04X}",
                            "old": f"{old_values[addr]:02X}",
                            "new": f"{new_value:02X}",
                        }
                    )
            if HGR_START <= addr <= HGR_END and new_value != old_values[addr]:
                hgr_writes.append(
                    {
                        "step": steps,
                        "pc": f"{pc:04X}",
                        "opcode": f"{opcode:02X}",
                        "addr": f"{addr:04X}",
                        "old": f"{old_values[addr]:02X}",
                        "new": f"{new_value:02X}",
                    }
                )

    hotspots = [
        {"pc": f"{pc:04X}", "count": count}
        for pc, count in sorted(visited_counts.items(), key=lambda item: item[1], reverse=True)[:32]
    ]

    return {
        "completed": cpu.PC == RETURN_SENTINEL,
        "steps": steps,
        "unknownOpcodesSkipped": unknown,
        "finalState": snapshot_state(cpu),
        "hotspots": hotspots,
        "flow": flow,
        "payloadReads": payload_reads,
        "payloadWrites": payload_writes,
        "hgrWrites": hgr_writes,
        "modeBranches": mode_branches,
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--planet", type=int, default=6)
    parser.add_argument("--state-x", type=lambda value: int(value, 0), default=0x30)
    parser.add_argument("--state-y", type=lambda value: int(value, 0), default=0x10)
    parser.add_argument("--coord-y", type=lambda value: int(value, 0))
    parser.add_argument("--pitch", type=lambda value: int(value, 0), default=0)
    parser.add_argument("--bank", type=lambda value: int(value, 0), default=0)
    parser.add_argument("--heading", type=lambda value: int(value, 0), default=0x14)
    parser.add_argument("--surface-clamp", action="store_true")
    parser.add_argument("--max-entry-steps", type=int, default=400000)
    parser.add_argument("--max-trace-steps", type=int, default=120000)
    parser.add_argument(
        "--out",
        default="modern/web/public/data/debug/a2-3d1-trace.json",
    )
    args = parser.parse_args()

    cpu = CPU6502()
    load_standard_binaries(cpu, args.planet)
    apply_reentry_seed(cpu, args.planet)
    cpu.memory[0x95FD] = args.state_x & 0xFF
    cpu.memory[0x95FE] = args.state_y & 0xFF
    if args.surface_clamp:
        cpu.memory[0x731D] = 20
        cpu.memory[0x731E] = 0
        cpu.memory[0x7321] = 0
        cpu.memory[0x7322] = 0
    if args.coord_y is not None:
        coord = args.coord_y & 0xFFFF
        cpu.memory[0x731D] = coord & 0xFF
        cpu.memory[0x731E] = (coord >> 8) & 0xFF
    cpu.memory[0x7321] = args.pitch & 0xFF
    cpu.memory[0x7322] = args.bank & 0xFF
    cpu.memory[0x7323] = args.heading & 0xFF

    push_return_sentinel(cpu, SPACE_SIM_ENTRY)
    entry = run_until_pc(cpu, 0x6000, max_steps=args.max_entry_steps)
    trace = trace_from_6000(cpu, max_steps=args.max_trace_steps)

    output = {
        "planet": args.planet,
        "entryTo6000": entry,
        "initialStateAt6000": snapshot_state(cpu),
        "trace": trace,
    }

    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2))
    print(out_path)


if __name__ == "__main__":
    main()
