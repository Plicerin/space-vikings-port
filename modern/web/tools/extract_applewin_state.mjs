import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_INPUT = path.resolve(
  process.cwd(),
  '..',
  '..',
  'disk_image',
  'Space Vikings (4am crack).aws.yaml',
);
const DEFAULT_OUTPUT = path.resolve(
  process.cwd(),
  'public',
  'data',
  'debug',
  'applewin-space-vikings-state.json',
);

const RANGE_SPECS = [
  { label: 'shipBuffer', addr: 0x7879, len: 0x0100 },
  { label: 'shipOpcodeRecord', addr: 0x7318, len: 0x0020 },
  { label: 'shipDispatchTableA', addr: 0x6076, len: 0x0010 },
  { label: 'shipDispatchTableB', addr: 0x6086, len: 0x0010 },
  { label: 'shipOpcode04Handler', addr: 0x62BE, len: 0x0010 },
  { label: 'streamAdvanceHelper', addr: 0x6184, len: 0x0010 },
  { label: 'shipOpcode09Handler', addr: 0x7148, len: 0x0030 },
  { label: 'shipOperandReader', addr: 0x672D, len: 0x0030 },
  { label: 'controlBlock9506', addr: 0x9506, len: 0x0040 },
  { label: 'controlBlock9530', addr: 0x9530, len: 0x0040 },
  { label: 'hiresPage1', addr: 0x2000, len: 0x2000 },
];

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] ?? DEFAULT_OUTPUT);
  const text = await fs.readFile(inputPath, 'utf8');
  const state = parseAppleWinSaveState(text);

  const payload = {
    source: inputPath,
    generatedAt: new Date().toISOString(),
    cpu: state.cpu,
    video: state.video,
    keyRanges: Object.fromEntries(
      RANGE_SPECS.map((spec) => [spec.label, dumpRange(state.mainMemory, spec.addr, spec.len)]),
    ),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  process.stdout.write(`wrote ${outputPath}\n`);
  process.stdout.write(`shipBuffer[0x7879]: ${payload.keyRanges.shipBuffer.hexLines[0].hex}\n`);
  process.stdout.write(`opcode09@0x7318: ${payload.keyRanges.shipOpcodeRecord.hexLines[0].hex}\n`);
}

function parseAppleWinSaveState(text) {
  const cpu = {
    type: capture(text, /^\s+Type:\s+(.+)$/m, 'CPU type'),
    a: parseHex(capture(text, /^\s+A:\s+(0x[0-9A-F]+)$/im, 'CPU A')),
    x: parseHex(capture(text, /^\s+X:\s+(0x[0-9A-F]+)$/im, 'CPU X')),
    y: parseHex(capture(text, /^\s+Y:\s+(0x[0-9A-F]+)$/im, 'CPU Y')),
    p: parseHex(capture(text, /^\s+P:\s+(0x[0-9A-F]+)$/im, 'CPU P')),
    s: parseHex(capture(text, /^\s+S:\s+(0x[0-9A-F]+)$/im, 'CPU S')),
    pc: parseHex(capture(text, /^\s+PC:\s+(0x[0-9A-F]+)$/im, 'CPU PC')),
    cumulativeCycles: capture(text, /^\s+Cumulative Cycles:\s+(0x[0-9A-F]+)$/im, 'CPU cycles'),
  };
  const video = {
    mode: parseHex(capture(text, /^\s+Video Mode:\s+(0x[0-9A-F]+)$/im, 'Video mode')),
    cyclesThisFrame: Number.parseInt(
      capture(text, /^\s+Cycles This Frame:\s+([0-9]+)$/im, 'Video cycles this frame'),
      10,
    ),
    refreshRate: Number.parseInt(
      capture(text, /^\s+Video Refresh Rate:\s+([0-9]+)$/im, 'Video refresh rate'),
      10,
    ),
  };

  const mainMemory = new Uint8Array(0x10000);
  const mainMemoryBlock = captureBlock(
    text,
    /Main Memory:\r?\n([\s\S]*?)^\s{4}[A-Za-z].*:\s*$/m,
    'Main Memory',
  );
  const lines = mainMemoryBlock.match(/^\s{6}([0-9A-F]{4}):\s*([0-9A-F]+)$/gim) ?? [];
  if (lines.length === 0) {
    throw new Error('No main-memory rows found in AppleWin save state');
  }
  for (const line of lines) {
    const match = /^\s{6}([0-9A-F]{4}):\s*([0-9A-F]+)$/i.exec(line);
    if (!match) continue;
    const baseAddr = Number.parseInt(match[1], 16);
    const hex = match[2].trim();
    for (let i = 0; i < hex.length; i += 2) {
      const byteOffset = i >> 1;
      const addr = baseAddr + byteOffset;
      if (addr >= mainMemory.length) break;
      mainMemory[addr] = Number.parseInt(hex.slice(i, i + 2), 16);
    }
  }

  return { cpu, video, mainMemory };
}

function capture(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`Missing ${label}`);
  }
  return match[1];
}

function captureBlock(text, pattern, label) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`Missing ${label} block`);
  }
  return match[1];
}

function parseHex(value) {
  return Number.parseInt(value, 16);
}

function dumpRange(memory, start, len) {
  const bytes = Array.from(memory.slice(start, start + len));
  const hexLines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    hexLines.push({
      addr: toHex(start + i, 4),
      hex: chunk.map((value) => toHex(value, 2)).join(' '),
    });
  }
  return {
    start: toHex(start, 4),
    length: len,
    bytes,
    hexLines,
  };
}

function toHex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
