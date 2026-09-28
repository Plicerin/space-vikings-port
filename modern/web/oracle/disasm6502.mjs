// A 6502 disassembler.
//
// Nothing clever - the point is that it is exhaustive and its addressing modes are right,
// so a listing can be trusted as far as it goes. What it cannot tell you is which bytes are
// code: decoding data produces confident nonsense. That is what execution traces are for.

// mode: imp, acc, imm, zp, zpx, zpy, izx, izy, abs, abx, aby, ind, rel
const M = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, izx: 2, izy: 2, abs: 3, abx: 3, aby: 3, ind: 3, rel: 2 };

const OPS = {};
const def = (hex, name, mode) => { OPS[hex] = { name, mode, len: M[mode] }; };

// load/store
for (const [op, m] of [[0xa9, 'imm'], [0xa5, 'zp'], [0xb5, 'zpx'], [0xad, 'abs'], [0xbd, 'abx'], [0xb9, 'aby'], [0xa1, 'izx'], [0xb1, 'izy']]) def(op, 'LDA', m);
for (const [op, m] of [[0xa2, 'imm'], [0xa6, 'zp'], [0xb6, 'zpy'], [0xae, 'abs'], [0xbe, 'aby']]) def(op, 'LDX', m);
for (const [op, m] of [[0xa0, 'imm'], [0xa4, 'zp'], [0xb4, 'zpx'], [0xac, 'abs'], [0xbc, 'abx']]) def(op, 'LDY', m);
for (const [op, m] of [[0x85, 'zp'], [0x95, 'zpx'], [0x8d, 'abs'], [0x9d, 'abx'], [0x99, 'aby'], [0x81, 'izx'], [0x91, 'izy']]) def(op, 'STA', m);
for (const [op, m] of [[0x86, 'zp'], [0x96, 'zpy'], [0x8e, 'abs']]) def(op, 'STX', m);
for (const [op, m] of [[0x84, 'zp'], [0x94, 'zpx'], [0x8c, 'abs']]) def(op, 'STY', m);
// arithmetic / logic
for (const [op, m] of [[0x69, 'imm'], [0x65, 'zp'], [0x75, 'zpx'], [0x6d, 'abs'], [0x7d, 'abx'], [0x79, 'aby'], [0x61, 'izx'], [0x71, 'izy']]) def(op, 'ADC', m);
for (const [op, m] of [[0xe9, 'imm'], [0xe5, 'zp'], [0xf5, 'zpx'], [0xed, 'abs'], [0xfd, 'abx'], [0xf9, 'aby'], [0xe1, 'izx'], [0xf1, 'izy']]) def(op, 'SBC', m);
for (const [op, m] of [[0x29, 'imm'], [0x25, 'zp'], [0x35, 'zpx'], [0x2d, 'abs'], [0x3d, 'abx'], [0x39, 'aby'], [0x21, 'izx'], [0x31, 'izy']]) def(op, 'AND', m);
for (const [op, m] of [[0x09, 'imm'], [0x05, 'zp'], [0x15, 'zpx'], [0x0d, 'abs'], [0x1d, 'abx'], [0x19, 'aby'], [0x01, 'izx'], [0x11, 'izy']]) def(op, 'ORA', m);
for (const [op, m] of [[0x49, 'imm'], [0x45, 'zp'], [0x55, 'zpx'], [0x4d, 'abs'], [0x5d, 'abx'], [0x59, 'aby'], [0x41, 'izx'], [0x51, 'izy']]) def(op, 'EOR', m);
for (const [op, m] of [[0xc9, 'imm'], [0xc5, 'zp'], [0xd5, 'zpx'], [0xcd, 'abs'], [0xdd, 'abx'], [0xd9, 'aby'], [0xc1, 'izx'], [0xd1, 'izy']]) def(op, 'CMP', m);
for (const [op, m] of [[0xe0, 'imm'], [0xe4, 'zp'], [0xec, 'abs']]) def(op, 'CPX', m);
for (const [op, m] of [[0xc0, 'imm'], [0xc4, 'zp'], [0xcc, 'abs']]) def(op, 'CPY', m);
for (const [op, m] of [[0x24, 'zp'], [0x2c, 'abs']]) def(op, 'BIT', m);
// shifts
for (const [op, m] of [[0x0a, 'acc'], [0x06, 'zp'], [0x16, 'zpx'], [0x0e, 'abs'], [0x1e, 'abx']]) def(op, 'ASL', m);
for (const [op, m] of [[0x4a, 'acc'], [0x46, 'zp'], [0x56, 'zpx'], [0x4e, 'abs'], [0x5e, 'abx']]) def(op, 'LSR', m);
for (const [op, m] of [[0x2a, 'acc'], [0x26, 'zp'], [0x36, 'zpx'], [0x2e, 'abs'], [0x3e, 'abx']]) def(op, 'ROL', m);
for (const [op, m] of [[0x6a, 'acc'], [0x66, 'zp'], [0x76, 'zpx'], [0x6e, 'abs'], [0x7e, 'abx']]) def(op, 'ROR', m);
// inc/dec
for (const [op, m] of [[0xe6, 'zp'], [0xf6, 'zpx'], [0xee, 'abs'], [0xfe, 'abx']]) def(op, 'INC', m);
for (const [op, m] of [[0xc6, 'zp'], [0xd6, 'zpx'], [0xce, 'abs'], [0xde, 'abx']]) def(op, 'DEC', m);
// jumps, branches, flags, transfers, stack
def(0x4c, 'JMP', 'abs'); def(0x6c, 'JMP', 'ind'); def(0x20, 'JSR', 'abs');
for (const [op, n] of [[0x10, 'BPL'], [0x30, 'BMI'], [0x50, 'BVC'], [0x70, 'BVS'], [0x90, 'BCC'], [0xb0, 'BCS'], [0xd0, 'BNE'], [0xf0, 'BEQ']]) def(op, n, 'rel');
for (const [op, n] of [[0x60, 'RTS'], [0x40, 'RTI'], [0x00, 'BRK'], [0xea, 'NOP'],
  [0x18, 'CLC'], [0x38, 'SEC'], [0x58, 'CLI'], [0x78, 'SEI'], [0xb8, 'CLV'], [0xd8, 'CLD'], [0xf8, 'SED'],
  [0xaa, 'TAX'], [0x8a, 'TXA'], [0xa8, 'TAY'], [0x98, 'TYA'], [0xba, 'TSX'], [0x9a, 'TXS'],
  [0xe8, 'INX'], [0xc8, 'INY'], [0xca, 'DEX'], [0x88, 'DEY'],
  [0x48, 'PHA'], [0x68, 'PLA'], [0x08, 'PHP'], [0x28, 'PLP']]) def(op, n, 'imp');

const hx = (v, n = 2) => '$' + v.toString(16).toUpperCase().padStart(n, '0');

/**
 * Disassemble one instruction at `addr`.
 * `sym` maps an address to a label, so operands read as names where one is known.
 */
export function disasm1(mem, addr, sym = {}) {
  const op = mem[addr];
  const e = OPS[op];
  if (!e) return { addr, len: 1, bytes: [op], text: `.byte ${hx(op)}`, illegal: true };
  const b1 = mem[addr + 1], b2 = mem[addr + 2];
  const word = b1 | (b2 << 8);
  const name = (a, n) => sym[a] ?? hx(a, n);
  let operand = '';
  switch (e.mode) {
    case 'imp': break;
    case 'acc': operand = 'A'; break;
    case 'imm': operand = `#${hx(b1)}`; break;
    case 'zp': operand = name(b1, 2); break;
    case 'zpx': operand = `${name(b1, 2)},X`; break;
    case 'zpy': operand = `${name(b1, 2)},Y`; break;
    case 'izx': operand = `(${name(b1, 2)},X)`; break;
    case 'izy': operand = `(${name(b1, 2)}),Y`; break;
    case 'abs': operand = name(word, 4); break;
    case 'abx': operand = `${name(word, 4)},X`; break;
    case 'aby': operand = `${name(word, 4)},Y`; break;
    case 'ind': operand = `(${name(word, 4)})`; break;
    case 'rel': {
      const target = (addr + 2 + (b1 > 127 ? b1 - 256 : b1)) & 0xffff;
      operand = name(target, 4);
      break;
    }
  }
  const bytes = [];
  for (let i = 0; i < e.len; i++) bytes.push(mem[addr + i]);
  return { addr, len: e.len, bytes, text: `${e.name}${operand ? ' ' + operand : ''}`,
    target: e.mode === 'rel' ? (addr + 2 + (b1 > 127 ? b1 - 256 : b1)) & 0xffff
      : (e.mode === 'abs' && (e.name === 'JMP' || e.name === 'JSR')) ? word : null,
    op: e.name, mode: e.mode };
}

/** Disassemble a run of addresses, honouring a set of addresses known to be code. */
export function disasmRange(mem, from, to, { sym = {}, code = null } = {}) {
  const out = [];
  let a = from;
  while (a < to) {
    if (code && !code.has(a)) {                       // not seen executing: emit as data
      const run = [];
      while (a < to && (!code || !code.has(a)) && run.length < 8) { run.push(mem[a]); a++; }
      out.push({ addr: a - run.length, len: run.length, bytes: run, data: true,
        text: `.byte ${run.map((b) => hx(b)).join(', ')}` });
      continue;
    }
    const d = disasm1(mem, a, sym);
    out.push(d);
    a += d.len;
  }
  return out;
}

export { hx };

/**
 * Find code by following it, rather than by decoding straight through.
 *
 * Starts at the given entry points and walks instructions, following branches, JSRs and
 * JMPs, and stopping at RTS/RTI/unconditional JMP where there is no fall-through. This
 * finds far more code than an execution trace (which only sees the branches that happened
 * to be taken) while still refusing to decode bytes nothing can reach.
 *
 * Returns the set of addresses that begin an instruction, and the call/jump targets found.
 */
export function traverse(mem, entries, { lo = 0, hi = 0x10000 } = {}) {
  const starts = new Set();
  const calls = new Map();
  const queue = [...entries];
  const seen = new Set();
  while (queue.length) {
    let a = queue.pop();
    while (a >= lo && a < hi && !seen.has(a)) {
      seen.add(a);
      const d = disasm1(mem, a);
      if (d.illegal) break;                       // not code, or we lost the boundary
      starts.add(a);
      if (d.target !== null && d.target !== undefined) {
        calls.set(d.target, (calls.get(d.target) ?? 0) + 1);
        if (d.target >= lo && d.target < hi) queue.push(d.target);
      }
      if (d.op === 'RTS' || d.op === 'RTI' || d.op === 'BRK') break;
      if (d.op === 'JMP') break;                  // no fall-through
      a += d.len;
    }
  }
  return { starts, calls };
}
