import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { lootValue2400, rollArtRate, repairBill2500, repairAvailable2505,
  baseRefusal2100, baseCost2170 } from '../engine/diskEconomy';
import { setScene, log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';
import { writeLines, clearLines } from '../engine/menu';
import { drawDamageLamp } from './dmg';

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
    // 5006 echoes the digit and nothing else - the hi-res character generator draws no cursor,
    // so the underscore that stood here was the port's. The trailing blank is 5002's `PRINT
    // "  ";`, which is what takes a digit off again on a backspace.
    hires.hcolor(1);
    hires.text(`${buf} `, col, row);
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
    // 5. GROUND FORCES line 70's PRINT left the cursor on row 2, so these land on rows 2 and
    // 3 - and SHORE LEAVE draws no frame on this path at all, because line 14 has not run yet.
    hires.hcolor(1);
    writeLines(hires, 2, 3, ['SIR! THE PLANET', "HASN'T SURRENDERED!"]);
    hires.hcolor(5);
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

  // 2098: `POKE 38158, PEEK(38209): POKE 38166,2` - both bytes, not just the location. Without
  // the first one the troops are on shore leave on no particular planet, and RECALL's line 2000
  // and GROUND FORCES' 66 and 67 all read that byte.
  state.forces.troopPlanetIndex = state.planetIndex;
  state.forces.troopLocation = 2;

  glog('shoreLeave', `pay=${yes} credits=${state.credits}`);

  await commanderWait(ctx, 2500);   // 2099
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

  drawShoreLeaveFrame(hires);

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

  // 2099: `FOR J = 1 TO 4000: NEXT` and then RUN GROUND FORCES. There is no key
  // prompt on any of these screens - the disk simply waits.
  await commanderWait(ctx, 2500);
  if (state.commanderMode) return scenes.run('starshipSimulator');
  return scenes.run('groundForces');
}

/** 2510's list starts on the line under the title, which 2510's own PRINT leaves at row 3. */
export const REPAIR_LIST_ROW = 3;

async function repairRestock(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  // 2505: `IF PEEK(38210) = 0 OR PEEK(29469) > 22`. 29469 is YI, the **low byte** of the
  // ship's Y as 140 stores it, so the test is "landed", not "somewhere in the air": 147 puts
  // Y on 20 and holds it there, and that 20 is what gets through. Measured on the machine by
  // `probe_repair.mjs` - at Y 200 the screen refuses, at Y 20 it does not. `state.inOrbit`,
  // which the port tested instead, let a repair happen at any height.
  const yLow = (((Math.round(state.y) % 65536) + 65536) % 65536) & 255;
  if (!repairAvailable2505(!!state.atmosphere, yLow)) {
    drawShoreLeaveFrame(hires);
    // 2505 prints no title on the refusal either.
    hires.hcolor(1);
    writeLines(hires, 3, 3, ['YOU MUST LAND ON', 'PLANET FIRST.']);
    await commanderWait(ctx, 2500);   // 2099
    return scenes.run('groundForces');
  }

  drawShoreLeaveFrame(hires);

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
  // Two of the twelve are not percentages of anything. 38199 is the **energy** line 8 reads
  // into E and the flight loop spends, and 2525 tops it up to 63; 38187 is the **missile
  // count** 1090 decrements two at a time, and 2530 restocks it to 100. The port had both
  // pointed at `damage.powerPct` and `damage.missilePct`, fields nothing else reads, so a
  // paid-for repair left the ship with the same energy and the same empty rack it came in
  // with. Both measured on the machine: 38199 went 9 to 63 and 38187 went 0 to 100.
  const dmg = state.damage;
  const bill = repairBill2500([
    dmg.shieldsPct, Math.round(state.energy), dmg.engine1Pct, dmg.engine2Pct, dmg.computerPct,
    dmg.radarPct, dmg.envPct, dmg.hullPct, dmg.hyperdrivePct, state.missilesRemaining,
    dmg.laserPct, 100,
  ]);
  const totalCost = bill.total;
  const [shieldsAfter, energyAfter, engine1After, engine2After, computerAfter, radarAfter,
    envAfter, hullAfter, hyperdriveAfter, missilesAfter, laserAfter] = bill.after;
  dmg.shieldsPct = shieldsAfter;
  state.energy = energyAfter;
  dmg.engine1Pct = engine1After;
  dmg.engine2Pct = engine2After;
  dmg.computerPct = computerAfter;
  dmg.radarPct = radarAfter;
  dmg.envPct = envAfter;
  dmg.hullPct = hullAfter;
  dmg.hyperdrivePct = hyperdriveAfter;
  state.missilesRemaining = missilesAfter;
  dmg.laserPct = laserAfter;

  // 2520-2530 each print the system and the byte it was at before the repair, in three
  // pieces: the name at the window's margin, `HTAB 13` and the number, `HTAB 17` and the
  // per-cent sign. The two restock branches print `A$;` alone, so only 2520's systems get a
  // colon. Measured off the machine's own page: columns 2, 13 and 17, first row 3.
  let row = REPAIR_LIST_ROW;
  for (const line of bill.lines) {
    if (!line.drew || row > 13) continue;
    const restock = line.index === 2 || line.index === 10;
    hires.text(restock ? line.name : `${line.name}:`, 2, row);
    hires.text(`${Math.round(line.before)}`, 13, row);
    hires.text('%', 17, row);
    row++;
  }

  state.damage.laserOperational = state.damage.laserPct >= 10;
  state.laserOperational = state.damage.laserPct >= 10;

  await wait(1500);

  // 2545: `HCOLOR= 1: FOR J = 153 TO 157: HPLOT 262,J TO 271,J` - the same ten-by-five bar DMG
  // lights orange, put back to green now the ship is whole. 2555 then clears the flag behind
  // it, which is what stops STARSHIP SIMULATOR 3360 from running DMG again on the next hit.
  drawDamageLamp(hires, 1);
  state.shipDamaged = false;

  drawShoreLeaveFrame(hires);

  hires.hcolor(3);
  hires.text('REPAIR SHIP', 4, 2);
  hires.hcolor(1);

  // 2555: `CR = INT(CR)`, before 2560 prints it and before the comparison that follows.
  state.credits = Math.floor(state.credits);

  // 2550's title, a blank PRINT and two lines, and then 2560 straight on from row 6.
  writeLines(hires, 2, 4, [
    'ALL REPAIRS ARE',
    'COMPLETE, SIR.',
    'THE TOTAL REPAIR',
    'BILL COMES TO',
    `${totalCost} CREDITS.`,
    `YOU HAVE ${Math.floor(state.credits)}`,
    'CREDITS.',
  ]);

  // 2600 opens with its own `GOSUB 2080`, which wipes the panel - so neither refusal is
  // appended under the bill the way the port used to append it. Both start again at row 2,
  // 2602 with four lines and 2605 with three, and the N branch jumps straight to 2605.
  const angry = () => {
    state.planetSurrendered = false;
    state.planets[state.planetIndex].surrendered = false;
    clearPendingConquestCollection(state, state.planetIndex);
  };
  if (state.credits < totalCost) {
    drawShoreLeaveFrame(hires);
    hires.hcolor(1);
    writeLines(hires, 2, 2, ["YOU DON'T HAVE", 'ENOUGH CREDITS!', 'YOU HAVE 0 CREDITS',
      'LEFT!', "I'M AFRAID YOU'VE", 'MADE THE LOCAL', 'GOVERNMENT ANGRY!']);
    state.credits = 0;
    angry();
    glog('repair', `cost=${totalCost} FAILED - planet lost`);
  } else {
    hires.text('ARE YOU GOING TO', 2, 11);
    hires.text('PAY, SIR? (Y/N)', 2, 12);
    const yes = await getYN(ctx);
    // 2580: only an explicit N with something to pay for refuses, because of `AND P > 0`.
    if (yes || totalCost === 0) {
      state.credits = Math.floor(state.credits - totalCost);
      glog('repair', `cost=${totalCost} credits=${state.credits}`);
    } else {
      drawShoreLeaveFrame(hires);
      hires.hcolor(1);
      writeLines(hires, 2, 2, ["I'M AFRAID YOU'VE", 'MADE THE LOCAL', 'GOVERNMENT ANGRY!']);
      angry();
      glog('repair', `refused payment - planet lost`);
    }
  }

  // BUY WEAPONS is not part of REPAIR/RESTOCK, whatever the menu calls it: the only GOSUB 3000
  // on the disk is at 2290, inside ENLIST TROOPS, so it is called from there instead.

  // 2099: `FOR J = 1 TO 4000: NEXT` and then RUN GROUND FORCES. There is no key
  // prompt on any of these screens - the disk simply waits.
  await commanderWait(ctx, 2500);
  if (state.commanderMode) return scenes.run('starshipSimulator');
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

  /**
   * 3020-3060's list. `PRINT "CREDITS:";: HTAB 13: PRINT CR` puts the label at column 1 and the
   * figure at column 12, and 3050's `HTAB 16` puts each count at column 15 - the semicolons are
   * what make those two separate prints rather than one string. The four rows run from 4, and
   * 3060's row of eighteen dots closes the list off.
   *
   * `prices` false is 3055's early exit: after the last purchase, 3110 calls 3020 again with
   * PL = 7 and it returns before 3060, so the screen is left showing the new totals and no
   * price at all.
   */
  const list = (prices: { name: string; price: number } | null): void => {
    drawShoreLeaveFrame(hires);
    hires.hcolor(3);
    hires.text('BUY WEAPONS', 3, 2);   // 3020: `PRINT " BUY WEAPONS"`
    hires.hcolor(1);
    hires.text('CREDITS:', 2, 4);
    hires.text(`${Math.floor(state.credits)}`, 13, 4);
    for (let i = 0; i < items.length; i++) {
      hires.text(`${items[i][0]}:`, 2, 5 + i);
      hires.text(`${state.forces[items[i][2]]}`, 16, 5 + i);
    }
    if (!prices) return;
    hires.text('.'.repeat(18), 2, 9);
    hires.text(`${prices.name} COST${prices.price}`, 2, 10);   // 3060's `VTAB 10`
  };

  for (const [name, basePrice, key] of items) {
    // 3060 draws the price, and all three refusals end `GOTO 3070` - not 3060 - so the price
    // and the list behind it are drawn **once** an item. Rolling a fresh `RND` on every
    // rejected answer, which is what this used to do, would let a silly number be typed until
    // the price came out low.
    const price = Math.floor((Math.random() + 0.2) * 4 * basePrice);
    list({ name, price });

    for (;;) {
      hires.hcolor(1);
      hires.text('BUY HOW MANY? ', 2, 11);   // 3070's `VTAB 11`
      const qty = await readNumber(ctx, 2, 12);   // 3070's V = 12, H = 2

      // 3070, 3072 and 3090 all blank row 11, print their refusal there, and then blank the
      // input row underneath - `PRINT "          "` and friends - so the number that was
      // typed goes away before the question comes back. 3070 and 3072 have no delay loop at
      // all: what holds the message on screen is `SPEED= 90` and `SPEED= 127` printing it a
      // character at a time, which the waits here stand in for.
      const refuse = async (msg: string, clearWidth: number, ms: number, alsoClear11 = false) => {
        clearLines(hires, 2, 11, 18, 1);
        hires.hcolor(1);
        hires.text(msg, 2, 11);
        await wait(ms);
        if (alsoClear11) clearLines(hires, 2, 11, 18, 1);
        clearLines(hires, 2, 12, clearWidth, 1);
      };
      if (qty < 0 || qty > 255) {
        await refuse('BUY 255 MAX.  ', 10, 1500);
        continue;
      }
      if (qty + (state.forces[key] as number) > 255) {
        await refuse('255 MAX ', 7, 1500);
        continue;
      }
      if (qty * price > state.credits) {
        // 3090 is the one with a `FOR L = 1 TO 2000` of its own, and it clears row 11 after.
        await refuse('NOT ENOUGH CREDITS', 11, 2000, true);
        continue;
      }

      state.credits = Math.floor(state.credits - qty * price);
      (state.forces[key] as number) = Math.min(255, (state.forces[key] as number) + qty);
      glog('buyWeapons', `${name} x${qty} cost=${qty * price}`);
      break;
    }
  }
  // 3110: `PL = 7: GOSUB 3020` - one last look at the list with the new counts on it.
  list(null);
  await wait(1500);
}

async function enlistTroops(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;

  // 2200-2300 is not one screen and one answer, which is how this used to read it. There are
  // two loops in it, and `probe_enlist.mjs` walked both on the machine:
  //
  //   2281 IF EN > CR THEN ...blank 10 to 13... VTAB 9: GOTO 2270
  //   2285 IF TR + EN > 20000 THEN ...TOO MANY TROOPS... POKE 38389,0: GOTO 2200
  //
  // An answer the purse cannot cover puts the question back and asks again - the machine's
  // re-asked page is its first page to the pixel - and an answer that would burst the 20000
  // ceiling starts the whole screen over with the trip's one enlistment handed back.
  for (;;) {
    drawShoreLeaveFrame(hires);

    hires.hcolor(3);
    hires.text('ENLIST TROOPS', 2, 2);   // 2200: no leading space
    hires.hcolor(1);

    // 2210 is tested before 2240, so a second visit is turned away whether or not the planet
    // has surrendered - and 2220 sets the flag before any of the rest of the screen runs.
    if (state.enlistedThisTrip) {
      hires.text('ONE TIME PER TRIP.', 2, 4);
      break;
    }
    state.enlistedThisTrip = true;                    // 2220

    if (!state.planetSurrendered) {
      writeLines(hires, 2, 4, ['THE PLANET HAS NOT', 'SURRENDERED YET!!']);
      break;
    }

    writeLines(hires, 2, 4, [
      'EACH NEW TROOP',
      'MUST BE PAID ONE',
      'CREDIT IN ADVANCE.',
      `YOU HAVE ${Math.floor(state.credits)}`,
      'CREDITS, SIR.',
      `TROOPS= ${state.forces.troops}`,
      'HOW MANY TROOPS',
      'DO YOU WANT TO',
      'ENLIST?',
    ]);

    // 2275 to 2281: keep asking until the answer is one the purse can cover.
    let en = 0;
    for (;;) {
      en = await readNumber(ctx, 2, 13);
      // 2275 ends `VTAB 13: HTAB 2: PRINT "       "`, so the digits that were typed are wiped
      // the moment they are read. The port had been leaving them on the line.
      clearLines(hires, 2, 13, 7, 1);
      if (en <= state.credits) break;
      // 2280 blanks rows 10, 11 and 12 before it prints, so the question goes away rather
      // than being written over - row 12's `ENLIST?` is gone on the machine's page.
      clearLines(hires, 2, 10, 18, 3);
      writeLines(hires, 2, 10, ["YOU DON'T HAVE", `${en} CREDITS!`]);
      await wait(2000);
      // 2281 blanks 10 to 13 and goes to 2270, which rewrites the count and the question.
      clearLines(hires, 2, 10, 18, 4);
      writeLines(hires, 2, 9, [
        `TROOPS= ${state.forces.troops}`,
        'HOW MANY TROOPS',
        'DO YOU WANT TO',
        'ENLIST?',
      ]);
    }

    if (state.forces.troops + en > 20000) {
      // `clearLines` leaves HCOLOR on 0, so this has to put it back before it draws or the
      // message goes down in black and the row simply looks blank.
      hires.hcolor(1);
      hires.text('TOO MANY TROOPS.  ', 2, 12);   // 2285's `VTAB 12: HTAB 2`
      await wait(2000);
      // `POKE 38389,0: GOTO 2200` - asking for an impossible number costs nothing, so the
      // trip's one enlistment is handed back and the screen starts again. 2280's refusal
      // does not do this. Measured: 38389 is 0 afterwards and the program is at 2200.
      state.enlistedThisTrip = false;
      continue;
    }

    state.forces.troops += en;
    state.credits = Math.floor(state.credits - en);
    glog('enlist', `troops=+${en} credits=${state.credits}`);
    // 2290 `TR = TR + EN: CR = CR - EN: GOSUB 3000` - paying the troops is what takes you to
    // the weapons, and 3060's prices are drawn there.
    await buyWeapons(ctx);
    break;
  }

  await commanderWait(ctx, 2500);   // 2099
  return scenes.run('groundForces');
}

async function establishBase(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  drawShoreLeaveFrame(hires);

  // 2100 prints no title. ESTABLISH BASE goes straight to its text.
  hires.hcolor(1);

  // 2100-2106, in the order the BASIC tests them. 2107 then sets the flag *before* the price
  // is even shown, so a refusal at 2130 for want of credits still spends the attempt.
  const refusal = baseRefusal2100({
    alreadyThere: state.planets[state.planetIndex].hasBase,
    // 2105: `IF PEEK(38282 + PEEK(38209)) < 2` - the technology byte, which the port keeps as
    // `defense`. This read `defender`, the ship in orbit.
    tooBackward: state.planets[state.planetIndex].defense < 2,
    alreadyTriedThisTrip: state.baseTriedThisLanding,
  });
  if (refusal === 'THERE IS ALREADY A BASE ON THIS PLANET, SIR!') {
    // Every one of these starts on row 2: 2080 ends at the bottom of its blanking loop and
    // 2081's `VTAB 2` brings the cursor back up before anything prints.
    writeLines(hires, 2, 2, ['THERE IS ALREADY', 'A BASE ON THIS', 'PLANET, SIR!']);
  } else if (refusal === 'THIS PLANET IS TOO BACKWARD TO BUILD A BASE, SIR!') {
    writeLines(hires, 2, 2, ['THIS PLANET IS TOO', 'BACKWARD TO BUILD', 'A BASE, SIR!']);
  } else if (refusal !== null) {
    writeLines(hires, 2, 2, ['ONLY ONE TIME PER', 'TRIP, SIR.']);
  } else {
    state.baseTriedThisLanding = true;              // 2107
    const cost = baseCost2170();                    // 2170, and 2110's INT

    // 2110: six lines from row 2, the fourth of them blank.
    writeLines(hires, 2, 2, [
      'SIR! IT WILL COST',
      `${cost} TO BUILD A`,
      'BASE HERE.',
      '',
      `YOU HAVE ${Math.floor(state.credits)}`,
      'CREDITS NOW.',
    ]);

    if (state.credits < cost) {
      // 2130, at the cursor 2110 left
      writeLines(hires, 2, 8, ["YOU DON'T HAVE", 'ENOUGH CREDITS TO', 'BUILD A BASE HERE.']);
    } else {
      // 2140's `VTAB 8`
      hires.text('BUILD A BASE?', 2, 8);
      hires.text('(Y/N)', 2, 9);
      const yes = await getYN(ctx);
      if (yes) {
        state.credits = Math.floor(state.credits - cost);
        state.planets[state.planetIndex].hasBase = true;
        // 2155's `PRINT " "` finishes the (Y/N) row, so 2160 lands on row 10.
        writeLines(hires, 2, 10, ['CONSTRUCTION IS', 'UNDER WAY, SIR.']);
        glog('base', `cost=${cost} credits=${state.credits}`);
      }
    }
  }

  await commanderWait(ctx, 2500);   // 2099
  return scenes.run('groundForces');
}

async function cryogenics(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  drawShoreLeaveFrame(hires);

  // 4000 prints no title - `R = 7: GOSUB 2080: VTAB 4: IF PEEK(38166) = 1 OR ...` goes straight
  // to the message. The CRYOGENICS heading that stood here was the port's, and it was invisible
  // to `shoreleave_parity.mjs` because that calls `drawShoreLeaveCryogenics`, which never had
  // one - the scene was adding it on top.
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

  await commanderWait(ctx, 2500);   // 2099
  return scenes.run('groundForces');
}
