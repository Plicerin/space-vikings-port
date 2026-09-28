// Applesoft BASIC, read back out of the machine's own memory.
//
// The running program is the most trustworthy document there is about this game: it is
// what the disk loaded, not what anyone wrote down afterwards. Applesoft keeps it as a
// linked list from TXTTAB ($801) — per line, a 2-byte pointer to the next line, a 2-byte
// line number, the tokenised text, and a 0 terminator. A 0 pointer ends the program.
//
// Tokens are $80-$EA in this fixed order; anything else is a literal character with its
// high bit set. Quoted text is copied through byte for byte.
export const APPLESOFT_TOKENS = ('END,FOR,NEXT,DATA,INPUT,DEL,DIM,READ,GR,TEXT,PR#,IN#,CALL,PLOT,HLIN,VLIN,' +
  'HGR2,HGR,HCOLOR=,HPLOT,DRAW,XDRAW,HTAB,HOME,ROT=,SCALE=,SHLOAD,TRACE,NOTRACE,NORMAL,' +
  'INVERSE,FLASH,COLOR=,POP,VTAB,HIMEM:,LOMEM:,ONERR,RESUME,RECALL,STORE,SPEED=,LET,GOTO,' +
  'RUN,IF,RESTORE,&,GOSUB,RETURN,REM,STOP,ON,WAIT,LOAD,SAVE,DEF,POKE,PRINT,CONT,LIST,' +
  'CLEAR,GET,NEW,TAB(,TO,FN,SPC(,THEN,AT,NOT,STEP,+,-,*,/,^,AND,OR,>,=,<,SGN,INT,ABS,USR,' +
  'FRE,SCRN(,PDL,POS,SQR,RND,LOG,EXP,COS,SIN,TAN,ATN,PEEK,LEN,STR$,VAL,ASC,CHR$,LEFT$,' +
  'RIGHT$,MID$').split(',');

/**
 * Detokenise one line's bytes.
 *
 * The line is split into alternating code and quoted runs, and only the code runs get
 * their spacing tidied. Tidying the whole line would eat the spaces inside string
 * constants, which on this disk are load-bearing — the title box is PRINT "*   ...   *".
 */
function detokeniseLine(mem, from, limit) {
  const segs = [{ quoted: false, text: '' }];
  let q = from;
  while (q < limit && mem[q] !== 0) {
    const b = mem[q++];
    const cur = segs[segs.length - 1];
    if (b === 0x22) segs.push({ quoted: !cur.quoted, text: '' });
    else if (b >= 0x80 && !cur.quoted) cur.text += ' ' + APPLESOFT_TOKENS[b - 0x80] + ' ';
    else cur.text += String.fromCharCode(b & 0x7f);
  }
  // Every quoted run is preceded by its opening quote; a run that is followed by another
  // segment was closed by one too. A string left open at end of line (line 3020 on this
  // disk does exactly that) must not gain a quote it never had.
  const text = segs.map((s, i) => (s.quoted ? '"' : (i ? '"' : '')) +
    (s.quoted ? s.text : s.text.replace(/\s+/g, ' ').replace(/ ([(,;:)]) ?/g, '$1')))
    .join('');
  return { text: text.trim(), end: q };
}

/** Detokenise a whole program out of a byte array indexed by absolute address. */
export function listProgram(mem, txttab = 0x801, limit = 0xC000) {
  const lines = [];
  let p = txttab;
  while (p < limit) {
    const next = mem[p] | (mem[p + 1] << 8);
    if (next === 0) break;                       // the end-of-program marker
    if (next <= p) throw new Error(`line link at $${p.toString(16)} points backwards to ` +
      `$${next.toString(16)} — this is not an Applesoft program`);
    const num = mem[p + 2] | (mem[p + 3] << 8);
    lines.push({ num, at: p, ...detokeniseLine(mem, p + 4, limit) });
    p = next;
  }
  return lines;
}
