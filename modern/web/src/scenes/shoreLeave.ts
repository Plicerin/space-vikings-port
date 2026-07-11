import type { SceneContext, SceneManager } from '../engine/sceneManager';
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

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('SHORE LEAVE', 4, 2);
  hires.hcolor(1);

  const pay = state.forces.troops;
  writeLines(hires, 2, 4, [
    'TROOPS READY FOR',
    'SHORE LEAVE, SIR.',
    `BACK PAY COMES TO`,
    `${pay} CREDITS.`,
    '',
    `YOU HAVE ${Math.floor(state.credits)}`,
    'CREDITS.',
  ]);
  hires.text('PAY THEM (Y/N)?', 2, 11);

  const yes = await getYN(ctx);

  if (!yes) {
    let m = state.forces.morale - 2;
    if (m < 1) m = 1;
    state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
    hires.text('NOT PAID.', 2, 13);
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
    hires.text('TROOPS PAID.', 2, 13);
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
  let lootValue = 0;
  const artPrice = 150 + Math.floor(Math.random() * 150);
  lootValue += l.artUnits * 10 * artPrice;
  lootValue += l.wineCases * 100 * 150;
  lootValue += l.luxuryFoodCases * 100;
  lootValue += l.fighterPartCrates * 200;
  lootValue += l.weaponCrates * 200;
  lootValue += l.electronicCrates * 200;
  lootValue += l.fissionablesLb * 300;
  lootValue += l.steelTons * 15;
  lootValue += l.collapsiumTons * 5;
  lootValue += l.titaniumKlb * 25;
  lootValue += l.platinum * 10 * 75;
  lootValue += l.silver * 20 * 100;
  lootValue += l.gold * 10 * 200;
  lootValue = Math.floor(lootValue * 2);

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

  const systems: [string, number, number][] = [
    ['SHIELD', state.damage.shieldsPct, 100],
    ['ENERGY', state.damage.powerPct, 100],
    ['#1 ENGINE', state.damage.engine1Pct, 100],
    ['#2 ENGINE', state.damage.engine2Pct, 100],
    ['COMPUTER', state.damage.computerPct, 100],
    ['RADAR', state.damage.radarPct, 100],
    ['ENV CTRL', state.damage.envPct, 100],
    ['HULL DMG', state.damage.hullPct, 100],
    ['H-DRIVE', state.damage.hyperdrivePct, 100],
    ['MISSILES', state.damage.missilePct, 100],
    ['LASER', state.damage.laserPct, 100],
    ['NAV COMP', 100, 100],
  ];

  let totalCost = 0;
  let row = 4;

  for (const [name, pct, max] of systems) {
    if (pct < max && name !== 'NAV COMP') {
      const dmgFrac = (max - pct) / max;
      let cost = 0;
      if (name === 'ENERGY') {
        const d2 = (100 - pct);
        cost = Math.floor((Math.random() * 200) * (100 - d2));
        state.damage.powerPct = 100;
      } else if (name === 'MISSILES') {
        cost = Math.floor((Math.random() * 100) * (100 - pct));
        state.damage.missilePct = 100;
      } else if (name === 'SHIELD') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.shieldsPct = 100;
      } else if (name === '#1 ENGINE') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.engine1Pct = 100;
      } else if (name === '#2 ENGINE') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.engine2Pct = 100;
      } else if (name === 'COMPUTER') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.computerPct = 100;
      } else if (name === 'RADAR') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.radarPct = 100;
      } else if (name === 'ENV CTRL') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.envPct = 100;
      } else if (name === 'HULL DMG') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.hullPct = 100;
      } else if (name === 'H-DRIVE') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.hyperdrivePct = 100;
      } else if (name === 'LASER') {
        cost = Math.floor((Math.random() * 150) * dmgFrac * 100);
        state.damage.laserPct = 100;
      }
      totalCost += cost;
      if (row < 18) {
        hires.text(`${name}: ${Math.round(pct)}%`, 2, row);
        row++;
      }
    }
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

  await buyWeapons(ctx);

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
