import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { lootValue2400, rollArtRate, repairBill2500 } from '../engine/diskEconomy';
import { setScene, log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';
import { writeLines } from '../engine/menu';

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function commanderWait(ctx: SceneContext, ms: number): Promise<void> {
  await wait(ctx.state.commanderMode ? Math.min(ms, 60) : ms);
}

function clearPanel(hires: import('../engine/hires').Hires): void {
  hires.hcolor(0);
  for (let y = 8; y <= 88; y++) hires.line(2, y, 138, y);
}

async function getYN(ctx: SceneContext): Promise<boolean> {
  if (ctx.state.commanderMode) return true;
  const { input } = ctx;
  for (;;) {
    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f).toUpperCase();
    if (ch === 'Y') return true;
    if (ch === 'N') return false;
  }
}

async function readNumber(ctx: SceneContext, col: number, row: number): Promise<number> {
  const { hires, input } = ctx;
  if (ctx.state.commanderMode) return 0;
  let buf = '';
  for (;;) {
    const k = await input.waitForKey();
    const ch = k & 0x7f;
    if (ch === 0x0d) {
      const n = parseInt(buf, 10);
      return isNaN(n) ? 0 : n;
    }
    if (ch === 0x08 || ch === 0x7f) {
      buf = buf.slice(0, -1);
    } else if (ch >= 0x30 && ch <= 0x39 && buf.length < 5) {
      buf += String.fromCharCode(ch);
    }
    hires.hcolor(1);
    hires.text(`${buf}_`, col, row);
  }
}


/**
 * SHORE LEAVE's frame - line 14's box and line 2080's clear.
 *
 * Like GROUND FORCES, SHORE LEAVE never clears or fills the screen. Line 14 draws the same
 * box COM does and line 2080 blanks rows 1-12 with eighteen printed spaces, so COM's twelve
 * readouts, its 40-character row 14 and the HCOLOR 6 flood are all still on the page.
 *
 * The clear lands inside the box without touching it: columns 1-18 are x 7-132 and rows 1-12
 * are y 8-103, while the box sits at x 1 and 139 and y 1 and 110.
 *
 * HCOLOR comes from line 14 and nothing changes it - $E4 reads 42 = $2A = HCOLOR 1 while the
 * pay screen holds - and $3CD is 0, so every one of these screens is green and normal video.
 */
export function drawShoreLeaveFrame(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);
  for (let r = 2; r <= 13; r++) hires.text(' '.repeat(18), 2, r);
}

/**
 * Lines 2082 and 2085 - the pay screen, which is where `ON J GOTO` falls through to when
 * GROUND FORCES option 3 leaves 38388 at 0.
 *
 * Line 2081's `VTAB 2` puts the first line on 0-based row 1; the original prints no title
 * here at all.
 */
export function drawShoreLeavePay(
  hires: import('../engine/hires').Hires,
  d: { troops: number; credits: number },
): void {
  drawShoreLeaveFrame(hires);
  const lines = [
    'TROOPS READY FOR',
    'SHORE LEAVE, SIR.',
    'BACK PAY COMES TO',
    `${d.troops} CREDITS.`,
    '',
    `YOU HAVE ${Math.floor(d.credits)}`,
    'CREDITS.',
    'PAY THEM (Y/N)?',
  ];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) hires.text(lines[i], 2, 2 + i);
  }
}

/**
 * Lines 4000-4020 - CRYOGENICS, reached by GROUND FORCES option 8, which pokes 38388 to 5.
 * Line 4 sends that one past line 5's surrender check, so it is the one sub-screen the
 * opening game can reach without anything else happening first.
 *
 * `VTAB 4` puts both lines on 0-based rows 3 and 4.
 */
export function drawShoreLeaveCryogenics(
  hires: import('../engine/hires').Hires,
  troopLocation: number,
): void {
  drawShoreLeaveFrame(hires);
  let a: string;
  let b: string;
  if (troopLocation === 1 || troopLocation === 2) { a = 'TROOPS NOT ON'; b = 'BOARD, SIR.'; }
  else if (troopLocation === 3) { a = 'TROOPS ARE BEING'; b = 'REVIVED, SIR.'; }
  else { a = 'TROOPS ARE BEING'; b = 'PUT IN CRYOGENICS'; }
  hires.text(a, 2, 4);
  hires.text(b, 2, 5);
}

export async function shoreLeaveScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state } = ctx;
  setScene('shoreLeave');

  const mode = state.shoreLeaveMode;

  if (mode === 5) {
    await cryogenics(ctx, scenes);
    return;
  }

  if (mode === 0 && !state.planetSurrendered) {
    hires.hgr();
    hires.hcolor(1);
    writeLines(hires, 2, 4, ['SIR! THE PLANET', "HASN'T SURRENDERED!"]);
    hires.hcolor(5);
    hires.text('PRESS ANY KEY...', 2, 20);
    await ctx.input.waitForKey();
    return scenes.run('groundForces');
  }

  switch (mode) {
    case 0: await shoreLeavePay(ctx, scenes); break;
    case 1: await enlistTroops(ctx, scenes); break;
    case 2: await sellLoot(ctx, scenes); break;
    case 3: await repairRestock(ctx, scenes); break;
    case 4: await establishBase(ctx, scenes); break;
    default: return scenes.run('groundForces');
  }
}

async function shoreLeavePay(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  const pay = state.forces.troops;
  drawShoreLeavePay(hires, { troops: pay, credits: state.credits });

  const yes = await getYN(ctx);

  if (!yes) {
    let m = state.forces.morale - 2;
    if (m < 1) m = 1;
    state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
  } else if (pay > state.credits) {
    writeLines(hires, 2, 13, ["YOU DON'T HAVE", 'ENOUGH CREDITS, SIR!']);
    let m = state.forces.morale - 2;
    if (m < 1) m = 1;
    state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
  } else {
    let m = state.forces.morale + 1;
    if (m > 6) m = 6;
    state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
    state.credits = Math.floor(state.credits - pay);
  }

  state.forces.troopLocation = 2;

  glog('shoreLeave', `pay=${yes} credits=${state.credits}`);

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  await input.waitForKey();
  return scenes.run('groundForces');
}

async function sellLoot(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  const l = state.loot;
  // 2400-2408, in diskEconomy.ts, checked against the disk to the credit. Four of the rates
  // here were wrong: art carried a stray * 10 and a 150..300 price where the BASIC rolls
  // 0..300, wine carried a stray * 100, and platinum and silver had their 20 and 10 the wrong
  // way round - 750 and 2000 where the machine pays 1500 and 1000.
  const lootValue = lootValue2400([
    l.artUnits, l.wineCases, l.luxuryFoodCases, l.fighterPartCrates, l.weaponCrates,
    l.electronicCrates, l.fissionablesLb, l.steelTons, l.collapsiumTons, l.titaniumKlb,
    l.platinum, l.silver, l.gold,
  ], rollArtRate());

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('SELL LOOT', 5, 2);
  hires.hcolor(1);

  writeLines(hires, 2, 4, [
    `YOU HAD ${Math.floor(state.credits)}`,
    'CREDITS.',
    'YOUR LOOT IS WORTH',
    `${lootValue} CREDITS.`,
    '',
    'THAT GIVES YOU A',
    `TOTAL OF ${Math.floor(state.credits + lootValue)}`,
    'CREDITS!',
  ]);

  state.credits = Math.floor(state.credits + lootValue);
  state.loot = {
    platinum: 0, gold: 0, silver: 0, titaniumKlb: 0,
    collapsiumTons: 0, steelTons: 0, fissionablesLb: 0,
    electronicCrates: 0, weaponCrates: 0, fighterPartCrates: 0,
    luxuryFoodCases: 0, wineCases: 0, artUnits: 0,
  };

  glog('sellLoot', `value=${lootValue} credits=${state.credits}`);

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  if (state.commanderMode) {
    await commanderWait(ctx, 600);
    return scenes.run('starshipSimulator');
  }
  await input.waitForKey();
  return scenes.run('groundForces');
}

async function repairRestock(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  if (!state.atmosphere || state.inOrbit) {
    hires.hgr();
    hires.hcolor(1);
    hires.line(1, 1, 139, 1);
    hires.line(139, 1, 139, 110);
    hires.line(139, 110, 1, 110);
    hires.line(1, 110, 1, 1);
    hires.hcolor(3);
    hires.text('REPAIR/RESTOCK', 3, 2);
    hires.hcolor(1);
    writeLines(hires, 3, 3, ['YOU MUST LAND ON', 'PLANET FIRST.']);
    hires.hcolor(5);
    hires.text('PRESS ANY KEY...', 2, 20);
    await input.waitForKey();
    return scenes.run('groundForces');
  }

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('REPAIR SHIP', 4, 2);
  hires.hcolor(1);

  // 2500's DATA, in the order 2510's `FOR J = 1 TO 12` reads it, mapped onto the port's
  // fields. `repairBill2500` has the three branches: 2520 for most systems at `RND * 150`,
  // 2525 for energy - which alone uses a threshold of 63, restores to 63, and gets *cheaper*
  // the worse it is - and 2530 for the missile rack at `RND * 100`.
  //
  // Nav. comp. is 38184 and the port has no field for it; nothing in the game damages it, so
  // it is passed as 100, which is what 2520's `IF D < 100` skips. On the disk a damaged one
  // would be repaired and charged for like any other.
  const dmg = state.damage;
  const bill = repairBill2500([
    dmg.shieldsPct, dmg.powerPct, dmg.engine1Pct, dmg.engine2Pct, dmg.computerPct,
    dmg.radarPct, dmg.envPct, dmg.hullPct, dmg.hyperdrivePct, dmg.missilePct,
    dmg.laserPct, 100,
  ]);
  const totalCost = bill.total;
  const [shieldsAfter, powerAfter, engine1After, engine2After, computerAfter, radarAfter,
    envAfter, hullAfter, hyperdriveAfter, missileAfter, laserAfter] = bill.after;
  dmg.shieldsPct = shieldsAfter;
  dmg.powerPct = powerAfter;
  dmg.engine1Pct = engine1After;
  dmg.engine2Pct = engine2After;
  dmg.computerPct = computerAfter;
  dmg.radarPct = radarAfter;
  dmg.envPct = envAfter;
  dmg.hullPct = hullAfter;
  dmg.hyperdrivePct = hyperdriveAfter;
  dmg.missilePct = missileAfter;
  dmg.laserPct = laserAfter;

  // 2520-2530 each print the system and the percentage it was at before the repair.
  let row = 4;
  for (const line of bill.lines) {
    if (!line.drew || row >= 18) continue;
    hires.text(`${line.name}: ${Math.round(line.before)}%`, 2, row);
    row++;
  }

  state.damage.laserOperational = state.damage.laserPct >= 10;
  state.laserOperational = state.damage.laserPct >= 10;

  await wait(1500);

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('REPAIR SHIP', 4, 2);
  hires.hcolor(1);

  writeLines(hires, 2, 4, [
    'ALL REPAIRS ARE',
    'COMPLETE, SIR.',
    '',
    'THE TOTAL REPAIR',
    'BILL COMES TO',
    `${totalCost} CREDITS.`,
    `YOU HAVE ${Math.floor(state.credits)}`,
    'CREDITS.',
  ]);

  if (state.credits < totalCost) {
    hires.hcolor(5);
    writeLines(hires, 2, 12, ["YOU DON'T HAVE", 'ENOUGH CREDITS!', "LOCAL GOV'T ANGRY!"], 5);
    state.planetSurrendered = false;
    state.planets[state.planetIndex].surrendered = false;
    clearPendingConquestCollection(state, state.planetIndex);
    state.credits = 0;
    glog('repair', `cost=${totalCost} FAILED - planet lost`);
  } else {
    hires.text('ARE YOU GOING TO', 2, 11);
    hires.text('PAY, SIR? (Y/N)', 2, 12);
    const yes = await getYN(ctx);
    if (yes || totalCost === 0) {
      state.credits = Math.floor(state.credits - totalCost);
      glog('repair', `cost=${totalCost} credits=${state.credits}`);
    } else {
      hires.text("LOCAL GOV'T ANGRY!", 2, 14);
      state.planetSurrendered = false;
      state.planets[state.planetIndex].surrendered = false;
      clearPendingConquestCollection(state, state.planetIndex);
      glog('repair', `refused payment - planet lost`);
    }
  }

  // BUY WEAPONS is not part of REPAIR/RESTOCK, whatever the menu calls it: the only GOSUB 3000
  // on the disk is at 2290, inside ENLIST TROOPS, so it is called from there instead.

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  if (state.commanderMode) {
    await commanderWait(ctx, 600);
    return scenes.run('starshipSimulator');
  }
  await input.waitForKey();
  return scenes.run('groundForces');
}

async function buyWeapons(ctx: SceneContext): Promise<void> {
  const { hires, state, input } = ctx;
  const items: [string, number, keyof typeof state.forces][] = [
    ['FIGHTERS', 50, 'fighters'],
    ['TRANSPORTS', 75, 'transports'],
    ['TANKS', 40, 'tanks'],
    ['MISSILES', 30, 'groundMissiles'],
  ];

  for (const [name, basePrice, key] of items) {
    for (;;) {
      hires.hgr();
      hires.hcolor(1);
      hires.line(1, 1, 139, 1);
      hires.line(139, 1, 139, 110);
      hires.line(139, 110, 1, 110);
      hires.line(1, 110, 1, 1);

      hires.hcolor(3);
      hires.text('BUY WEAPONS', 4, 2);
      hires.hcolor(1);

      hires.text(`CREDITS: ${Math.floor(state.credits)}`, 2, 4);
      for (const [n, , k] of items) {
        const idx = items.findIndex(it => it[2] === k);
        hires.text(`${n}: ${state.forces[k]}`, 2, 6 + idx);
      }

      const price = Math.floor((Math.random() + 0.2) * 4 * basePrice);
      hires.text(`${name} COST ${price}`, 2, 12);
      hires.text('BUY HOW MANY?', 2, 13);

      const qty = await readNumber(ctx, 2, 14);

      if (qty < 0 || qty > 255) {
      hires.text('BUY 255 MAX.', 2, 15);
        await wait(1500);
        continue;
      }
      if (qty + (state.forces[key] as number) > 255) {
        hires.text('255 MAX TOTAL', 2, 15);
        await wait(1500);
        continue;
      }
      if (qty * price > state.credits) {
        hires.text('NOT ENOUGH CREDITS', 2, 15);
        await wait(1500);
        continue;
      }

      state.credits = Math.floor(state.credits - qty * price);
      (state.forces[key] as number) = Math.min(255, (state.forces[key] as number) + qty);
      glog('buyWeapons', `${name} x${qty} cost=${qty * price}`);
      break;
    }
  }
}

async function enlistTroops(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('ENLIST TROOPS', 3, 2);
  hires.hcolor(1);

  if (!state.planetSurrendered) {
    writeLines(hires, 2, 4, ["THE PLANET HAS NOT", 'SURRENDERED YET!!']);
    hires.hcolor(5);
    hires.text('PRESS ANY KEY...', 2, 20);
    await input.waitForKey();
    return scenes.run('groundForces');
  }

  writeLines(hires, 2, 4, [
    'EACH NEW TROOP',
    'MUST BE PAID ONE',
    'CREDIT IN ADVANCE.',
    `YOU HAVE ${Math.floor(state.credits)}`,
    'CREDITS, SIR.',
    '',
    `TROOPS= ${state.forces.troops}`,
    '',
    'HOW MANY TROOPS',
    'DO YOU WANT TO',
    'ENLIST?',
  ]);

  const en = await readNumber(ctx, 2, 13);

  if (en > state.credits) {
    writeLines(hires, 2, 15, ["YOU DON'T HAVE", `${en} CREDITS!`]);
    await wait(2000);
  } else if (state.forces.troops + en > 20000) {
    hires.text('TOO MANY TROOPS.', 2, 15);
    await wait(2000);
  } else {
    state.forces.troops = Math.min(20000, state.forces.troops + en);
    state.credits = Math.floor(state.credits - en);
    glog('enlist', `troops=+${en} credits=${state.credits}`);
    // 2290 `TR = TR + EN: CR = CR - EN: GOSUB 3000` - paying the troops is what takes you to
    // the weapons, and 3060's prices are drawn there.
    await buyWeapons(ctx);
  }

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  await input.waitForKey();
  return scenes.run('groundForces');
}

async function establishBase(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('ESTABLISH BASE', 3, 2);
  hires.hcolor(1);

  if (state.planets[state.planetIndex].hasBase) {
    hires.text('THERE IS ALREADY', 2, 4);
    hires.text('A BASE ON THIS', 2, 5);
    hires.text('PLANET, SIR!', 2, 6);
  } else if (state.planets[state.planetIndex].defender < 2) {
    writeLines(hires, 2, 4, ['THIS PLANET IS TOO', 'BACKWARD TO BUILD', 'A BASE, SIR!']);
  } else {
    const cost = Math.floor(20000 + (Math.random() * 5000) * (Math.random() * 10));

    writeLines(hires, 2, 4, [
      'SIR! IT WILL COST',
      `${cost} TO BUILD A`,
      'BASE HERE.',
      '',
      `YOU HAVE ${Math.floor(state.credits)}`,
      'CREDITS NOW.',
    ]);

    if (state.credits < cost) {
      writeLines(hires, 2, 10, ["YOU DON'T HAVE", 'ENOUGH CREDITS TO', 'BUILD A BASE HERE.']);
    } else {
      hires.text('BUILD A BASE?', 2, 10);
      hires.text('(Y/N)', 2, 11);
      const yes = await getYN(ctx);
      if (yes) {
        state.credits = Math.floor(state.credits - cost);
        state.planets[state.planetIndex].hasBase = true;
        writeLines(hires, 2, 12, ['CONSTRUCTION IS', 'UNDER WAY, SIR.']);
        glog('base', `cost=${cost} credits=${state.credits}`);
      }
    }
  }

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  await input.waitForKey();
  return scenes.run('groundForces');
}

async function cryogenics(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('CRYOGENICS', 4, 2);
  hires.hcolor(1);

  const loc = state.forces.troopLocation;
  if (loc === 1 || loc === 2) {
    hires.text('TROOPS NOT ON', 2, 4);
    hires.text('BOARD, SIR.', 2, 5);
  } else if (loc === 3) {
    hires.text('TROOPS ARE BEING', 2, 4);
    hires.text('REVIVED, SIR.', 2, 5);
    state.forces.troopLocation = 0;
    glog('cryo', 'revived');
  } else {
    hires.text('TROOPS ARE BEING', 2, 4);
    hires.text('PUT IN CRYOGENICS', 2, 5);
    state.forces.troopLocation = 3;
    glog('cryo', 'frozen');
  }

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  await input.waitForKey();
  return scenes.run('groundForces');
}
