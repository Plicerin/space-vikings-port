/**
 * What the touch pad shows, per screen.
 *
 * The pad used to be three fixed clusters built for the cockpit, and on a phone that made the
 * game **unfinishable**: the title asks for `N` and the pad had no `N`, so you could not start
 * one. Nor pay your troops (`Y`/`N`), plot a course (`I J K M`, Return), or answer COM, whose
 * menus run to 6 while the pad stopped at 4.
 *
 * So it is built per scene now, from what that scene actually reads. Each entry below was taken
 * from the scene's own input handling, not guessed:
 *
 * | screen | reads |
 * | --- | --- |
 * | `start` | `N`, `O` |
 * | `opening` | any key, which skips the rest |
 * | `cockpit` | arrows, `1`-`4`, Space, `W`, `A`, `B`, `S`, `R`, `H`, `C` |
 * | `com` | `1`-`6` by submenu, and Return / Backspace for the two-digit planet entry |
 * | `galaxyMap` | `I J K M` for the cursor, Return to pick, Space to leave, `Y` for more |
 * | `groundForces` | `1`-`9` |
 * | `shoreLeave` | `Y`, `N`, and `0`-`9` with Return / Backspace where it asks a quantity |
 * | `end` | `1`-`3`, and `1`-`4` again for a slot when `saveSlots` is on |
 * | `supply` | `1` to see more, anything to leave |
 * | `radar` | anything identifies the ship, `X` goes back |
 *
 * Everything else waits for a keypress and does not care which, so it gets one button.
 */

export interface TouchKey {
  /** What `Input.press`/`pressHold` is given - a key name, not a code. */
  code: string;
  label: string;
  /** Held down rather than tapped, for the things the flight loop polls with `isDown`. */
  hold?: boolean;
  /** Lays out as a wide button on its own row. */
  wide?: boolean;
}

export interface TouchGroup {
  label: string;
  /** Three per row unless a key says `wide`. */
  keys: TouchKey[];
}

const ARROWS: TouchGroup = {
  label: 'BANK / PITCH',
  keys: [
    { code: 'ArrowUp', label: '▲', hold: true },
    { code: 'ArrowLeft', label: '◀', hold: true },
    { code: 'ArrowRight', label: '▶', hold: true },
    { code: 'ArrowDown', label: '▼', hold: true },
  ],
};

/** `1`..`n` as plain buttons, which is what every menu on this disk wants. */
const digits = (from: number, to: number, label = 'CHOOSE'): TouchGroup => ({
  label,
  keys: Array.from({ length: to - from + 1 }, (_, i) => ({
    code: String(from + i), label: String(from + i),
  })),
});

const ENTER: TouchKey = { code: 'Enter', label: 'ENTER' };
const BACK: TouchKey = { code: 'Backspace', label: 'DEL' };
const ANY: TouchKey = { code: ' ', label: 'CONTINUE', wide: true };

const LAYOUTS: Record<string, TouchGroup[]> = {
  start: [{
    label: 'NEW GAME OR OLD',
    keys: [
      { code: 'N', label: 'N) NEW', wide: true },
      { code: 'O', label: 'O) OLD', wide: true },
    ],
  }],

  opening: [{ label: 'OPENING', keys: [{ code: ' ', label: 'SKIP', wide: true }] }],

  cockpit: [
    ARROWS,
    {
      label: 'FIRE / POWER',
      keys: [
        { code: '1', label: 'SPD-' }, { code: '3', label: 'SPD--' }, { code: ' ', label: 'FIRE' },
        { code: '2', label: 'SPD+' }, { code: '4', label: 'SPD++' }, { code: 'W', label: 'WEAPON' },
      ],
    },
    {
      label: 'SYSTEMS',
      keys: [
        { code: 'A', label: 'AUTO' }, { code: 'B', label: 'COND' }, { code: 'S', label: 'SHLD' },
        { code: 'R', label: 'RADAR' }, { code: 'H', label: 'HYPER' }, { code: 'C', label: 'COM' },
      ],
    },
  ],

  // COM's three menus are 1-5, 1-6 and 1-3, and its planet prompt takes two digits then Return.
  com: [digits(1, 6, 'COMMAND'), { label: 'ENTRY', keys: [ENTER, BACK] }],

  galaxyMap: [
    {
      label: 'CURSOR',
      keys: [
        { code: 'I', label: '▲' },
        { code: 'J', label: '◀' },
        { code: 'K', label: '▶' },
        { code: 'M', label: '▼' },
      ],
    },
    {
      label: 'PICK',
      keys: [
        { code: 'Enter', label: 'SELECT' },
        { code: 'Y', label: 'Y) INFO' },
        { code: ' ', label: 'BACK' },
      ],
    },
  ],

  groundForces: [digits(1, 9, 'ORDERS')],

  shoreLeave: [
    { label: 'ANSWER', keys: [{ code: 'Y', label: 'Y) YES' }, { code: 'N', label: 'N) NO' }] },
    { label: 'HOW MANY', keys: [...digits(0, 9).keys, ENTER, BACK] },
  ],

  end: [digits(1, 4, 'END GAME')],

  supply: [{ label: 'SUPPLY', keys: [{ code: '1', label: '1) MORE' }, ANY] }],

  radar: [{
    label: 'RADAR',
    keys: [{ code: ' ', label: 'IDENTIFY' }, { code: 'X', label: 'X) BACK' }],
  }],
};

/** Everything that waits for a key without caring which. */
const ANY_KEY: TouchGroup[] = [{ label: 'PRESS A KEY', keys: [ANY] }];

/**
 * The pad for a screen.
 *
 * `scene` is whatever `gameLog` last recorded, which is lower-cased in places, so this matches
 * case-insensitively. An unknown screen gets the one-button pad rather than nothing, because a
 * screen with no way to continue is the bug this whole module exists to fix.
 */
export function touchLayoutFor(scene: string): TouchGroup[] {
  const want = (scene || '').toLowerCase();
  for (const [name, layout] of Object.entries(LAYOUTS)) {
    if (name.toLowerCase() === want) return layout;
  }
  return ANY_KEY;
}
