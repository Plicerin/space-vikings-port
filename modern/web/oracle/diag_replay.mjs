import { openOracle } from './a2.mjs';
import fs from 'fs';
const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const live = JSON.parse(fs.readFileSync('captured/trace_6000.json', 'utf8'));
const TRAP = 0x0300;
const CLEAR = process.argv[2] || 'none';
const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'r'; })()`);
await a2.frames(10);
const out = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, a2 = M.a2;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.a=${meta.cpu.a}; st.x=${meta.cpu.x}; st.y=${meta.cpu.y}; st.s=${meta.cpu.s}; st.sp=${meta.cpu.sp}; st.pc=${meta.pc};
  cpu.setState(st);
  const hash=(lo,hi)=>{let h=2166136261;for(let a=lo;a<hi;a++){h^=cpu.read(a);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
  if ('${CLEAR}' === 'p1') for (let a=0x2000;a<0x4000;a++) cpu.write(a,0);
  if ('${CLEAR}' === 'p2') for (let a=0x4000;a<0x6000;a++) cpu.write(a,0);
  const p1a=hash(0x2000,0x4000), p2a=hash(0x4000,0x6000);
  const sp=cpu.getState().sp;
  cpu.write(0x0100+((sp+1)&0xff), ${(TRAP-1)&0xff}); cpu.write(0x0100+((sp+2)&0xff), ${(TRAP-1)>>8});
  cpu.write(${TRAP},0x4C); cpu.write(${TRAP+1},${TRAP&0xff}); cpu.write(${TRAP+2},${TRAP>>8});
  const exec=new Uint8Array(0x1300);
  const tail=[];
  let steps=0,cyc=0;
  while(cpu.getPC()!==${TRAP} && steps<4000000){
    const pc=cpu.getPC(); if(pc>=0x6000&&pc<0x7300) exec[pc-0x6000]=1;
    tail.push(pc); if(tail.length>40) tail.shift();
    const b=cpu.getCycles(); cpu.stepCycles(1); steps++; cyc+=cpu.getCycles()-b;
    if(cyc>=M.FRAME_CYCLES){cyc=0;const mmu=a2.getMMU&&a2.getMMU();if(mmu&&mmu.resetVB)mmu.resetVB();const io=a2.getIO();if(io&&io.tick)io.tick();if(a2.tick)a2.tick();}
  }
  return JSON.stringify({steps,returned:cpu.getPC()===${TRAP},
    p1:[p1a,hash(0x2000,0x4000)], p2:[p2a,hash(0x4000,0x6000)],
    exec:Array.from(exec), tail});
})()`));
await a2.close();
console.log('clear:', process.argv[2]||'none', ' instructions', out.steps, ' returned', out.returned);
console.log('page1 changed:', out.p1[0] !== out.p1[1], '  page2 changed:', out.p2[0] !== out.p2[1]);
const n = out.exec.reduce((s,v)=>s+v,0);
const l = live.exec.reduce((s,v)=>s+v,0);
console.log('replay executed', n, 'bytes of $6000-$72FF;  live trace executed', l);
const onlyLive=[]; for(let i=0;i<out.exec.length;i++) if(live.exec[i] && !out.exec[i]) onlyLive.push(0x6000+i);
// where does the replay first diverge from live coverage?
let runs=[],st=-1;
for(let i=0;i<=out.exec.length;i++){
  const miss = i<out.exec.length && live.exec[i] && !out.exec[i];
  if(miss && st<0) st=i;
  if((!miss||i===out.exec.length) && st>=0){ if(i-st>=8) runs.push(['$'+(0x6000+st).toString(16),'$'+(0x6000+i-1).toString(16),i-st]); st=-1; }
}
console.log('runs of 8+ bytes the live game executed but the replay did not:');
for(const r of runs.slice(0,12)) console.log('  ', r[0]+'-'+r[1], '('+r[2]+' bytes)');
console.log('last PCs:', out.tail.map(p=>'$'+p.toString(16)).join(' '));
