#!/usr/bin/env python3
"""
Summarize PLANET #n payload streams using the opcode lengths confirmed by the
live A2-3D1 trace. This does not invent semantics; it only segments the source
bytes into the same record widths the original dispatcher is consuming.
"""

from __future__ import annotations

import json
from argparse import ArgumentParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXTRACTED = ROOT / "extracted"

# Widths confirmed from the live trace against PLANET no 6:
# 0E -> 1 opcode + 4 args
# 0F -> 1 opcode + 6 args
# 04 -> 1 opcode + 1 arg
# 07 -> 1 opcode + 1 arg
# 08 -> 1 opcode + 1 arg
# 09 -> 1 opcode + 1 arg
# 05 -> 1 opcode + 9 args
# 01/02 -> 1 opcode + 6 args
KNOWN_LENGTHS = {
    0x0E: 5,
    0x0F: 7,
    0x04: 2,
    0x07: 2,
    0x08: 2,
    0x09: 2,
    0x05: 10,
    0x01: 7,
    0x02: 7,
}


def summarize_payload(index: int, max_records: int) -> dict:
    path = EXTRACTED / f"PLANET no {index}.payload.bin"
    data = path.read_bytes()
    offset = 0
    records: list[dict] = []
    unknown_at: int | None = None

    while offset < len(data) and len(records) < max_records:
        opcode = data[offset]
        length = KNOWN_LENGTHS.get(opcode)
        if length is None or offset + length > len(data):
            unknown_at = offset
            break
        chunk = data[offset:offset + length]
        records.append(
            {
                "offset": f"{offset:04X}",
                "opcode": f"{opcode:02X}",
                "bytes": " ".join(f"{b:02X}" for b in chunk),
            }
        )
        offset += length

    return {
        "planet": index,
        "recordCount": len(records),
        "unknownAt": f"{unknown_at:04X}" if unknown_at is not None else None,
        "records": records,
    }


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--max-records", type=int, default=32)
    parser.add_argument(
        "--out",
        default="modern/web/public/data/debug/planet-payload-summary.json",
    )
    args = parser.parse_args()

    summaries = [summarize_payload(index, args.max_records) for index in range(21)]
    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summaries, indent=2))
    print(out_path)


if __name__ == "__main__":
    main()
