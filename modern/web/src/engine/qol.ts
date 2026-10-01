/**
 * The quality-of-life switchboard.
 *
 * The port's job is to be the disk: what the machine did, down to the pixel and the truncated
 * byte. Anything that makes the game *nicer* than the machine was - a smoother picture, a
 * faster frame, a gamepad, a save slot the original never had - is an addition, and additions
 * live behind a switch so that "is this the disk's behaviour?" always has an answer.
 *
 * **Everything defaults to off.** A fresh browser plays the game the machine played. The
 * switches are the player's, and they persist per browser; nothing here is read by the parity
 * harnesses, which compare the 280x192 buffer rather than what is on the screen.
 *
 * Adding one: put it in `QOL_FEATURES`, read it with `qolOn()` where it applies, and that is
 * all - the panel builds itself from the list.
 */

export type QolKey =
  | 'crtSmoothing'
  | 'crtBloom'
  | 'crtScanlines';

export interface QolFeature {
  key: QolKey;
  /** What the switch is called in the panel. */
  label: string;
  /** The heading it sits under. */
  group: string;
  /** One line, shown as the switch's title. */
  note: string;
}

export const QOL_FEATURES: readonly QolFeature[] = [
  {
    key: 'crtSmoothing',
    label: 'Smoothing',
    group: 'Picture',
    note: 'Bilinear upscale. Off is nearest-neighbour: an Apple II pixel is a hard-edged pixel.',
  },
  {
    key: 'crtBloom',
    label: 'Bloom',
    group: 'Picture',
    note: 'Draws the frame a second time in screen mode so bright pixels bleed. Nothing on the disk does this.',
  },
  {
    key: 'crtScanlines',
    label: 'Scanlines',
    group: 'Picture',
    note: 'A dark line every other row of the display.',
  },
];

const STORAGE_KEY = 'spaceVikingsQol';

type QolState = Partial<Record<QolKey, boolean>>;

let state: QolState = load();
const listeners = new Set<() => void>();

function load(): QolState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: QolState = {};
    for (const f of QOL_FEATURES) {
      if (typeof parsed[f.key] === 'boolean') out[f.key] = parsed[f.key];
    }
    return out;
  } catch {
    return {};
  }
}

function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage refused */ }
}

/** Off unless the player has turned it on. */
export function qolOn(key: QolKey): boolean {
  return state[key] === true;
}

export function setQol(key: QolKey, on: boolean): void {
  if (qolOn(key) === on) return;
  state[key] = on;
  save();
  for (const fn of listeners) fn();
}

export function resetQol(): void {
  state = {};
  save();
  for (const fn of listeners) fn();
}

/** Called whenever a switch moves, so anything holding a cached setting can re-read it. */
export function onQolChange(fn: () => void): void {
  listeners.add(fn);
}

/** Everything that is on, for the game log and for anyone reporting a problem. */
export function qolSummary(): string {
  const on = QOL_FEATURES.filter((f) => qolOn(f.key)).map((f) => f.key);
  return on.length ? on.join(', ') : 'none - as the disk plays it';
}
