/**
 * A gamepad, which the Apple II did not have.
 *
 * This is an addition and it lives behind the `gamepad` switch in the QOL panel, off until
 * someone turns it on. It adds nothing to the game and takes nothing away: every control it
 * offers is one the keyboard already has, pushed through the same `Input` the keyboard uses,
 * so the game cannot tell the difference and neither can a parity harness.
 *
 * The one thing it is careful about is the **latch**. `Input` models $C000: one key, held
 * until the program reads it. A pad polled sixty times a second would overwrite that latch
 * sixty times a second and turn one press into a stream, so buttons fire on their **rising
 * edge** only. The sticks and the d-pad are different - they stand in for keys being held
 * down, which is what the flight loop asks about with `isDown` - so those are set and cleared
 * as the pad moves.
 *
 * What is not mapped: the letter commands a pad has no room for, and the digits the menus
 * want. The keyboard is still there for those; this is for flying.
 */
import { qolOn, onQolChange } from './qol';
import type { Input } from './input';

/** How far a stick has to move before it counts as a direction. */
const DEADZONE = 0.45;

/** The held directions, which become the arrow keys the flight loop polls with `isDown`. */
const AXES: { code: string; axis: number; sign: 1 | -1; button: number }[] = [
  { code: 'ArrowLeft', axis: 0, sign: -1, button: 14 },
  { code: 'ArrowRight', axis: 0, sign: 1, button: 15 },
  { code: 'ArrowUp', axis: 1, sign: -1, button: 12 },
  { code: 'ArrowDown', axis: 1, sign: 1, button: 13 },
];

/**
 * The buttons, in the standard mapping Chrome reports.
 *
 * Face buttons first, then the shoulders for speed - 1 and 2 are STARSHIP SIMULATOR's three
 * off and three on, 3 and 4 its larger steps.
 */
const BUTTONS: { index: number; key: string; what: string }[] = [
  { index: 0, key: ' ', what: 'fire' },
  { index: 1, key: 'Enter', what: 'return - the galaxy map\'s pick, and the menus' },
  { index: 2, key: 'W', what: 'missile or laser' },
  { index: 3, key: 'C', what: 'the computer' },
  { index: 4, key: '1', what: 'slower' },
  { index: 5, key: '2', what: 'faster' },
  { index: 6, key: '3', what: 'slower still' },
  { index: 7, key: '4', what: 'faster still' },
  { index: 8, key: 'S', what: 'shields' },
  { index: 9, key: 'R', what: 'radar' },
];

export class GamepadInput {
  private held = new Set<string>();
  private wasDown = new Set<number>();
  private raf = 0;
  private running = false;

  constructor(private input: Input) {
    onQolChange(() => this.sync());
    this.sync();
  }

  /** Start or stop with the switch, and let go of anything held when it goes off. */
  private sync(): void {
    const want = qolOn('gamepad');
    if (want === this.running) return;
    this.running = want;
    if (want) {
      this.raf = requestAnimationFrame(() => this.poll());
    } else {
      cancelAnimationFrame(this.raf);
      this.releaseAll();
    }
  }

  private releaseAll(): void {
    for (const code of this.held) this.input.releaseHold(code);
    this.held.clear();
    this.wasDown.clear();
  }

  private pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  private poll(): void {
    if (!this.running) return;
    const pad = this.pad();
    if (pad) {
      for (const a of AXES) {
        const stick = (pad.axes[a.axis] ?? 0) * a.sign > DEADZONE;
        const dpad = pad.buttons[a.button]?.pressed === true;
        const down = stick || dpad;
        if (down && !this.held.has(a.code)) { this.input.pressHold(a.code); this.held.add(a.code); }
        else if (!down && this.held.has(a.code)) { this.input.releaseHold(a.code); this.held.delete(a.code); }
      }
      for (const b of BUTTONS) {
        const down = pad.buttons[b.index]?.pressed === true;
        // The rising edge only: the latch holds one key, and a held button is not a repeat.
        if (down && !this.wasDown.has(b.index)) this.input.press(b.key);
        if (down) this.wasDown.add(b.index); else this.wasDown.delete(b.index);
      }
    } else if (this.held.size) {
      this.releaseAll();
    }
    this.raf = requestAnimationFrame(() => this.poll());
  }
}

/** What the pad does, for the QOL panel's note. */
export const GAMEPAD_MAP = BUTTONS.map((b) => `${b.index}: ${b.what}`).join(', ');
