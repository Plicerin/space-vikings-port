import { Hires } from './hires';
import { GameState } from './gameState';
import { Input } from './input';
import { Audio } from './audio';
import { Loader } from './loader';
import { setScene, log as glog } from './gameLog';

/**
 * What a scene change costs, because on the disk it is a `RUN`.
 *
 * Every screen in this game is its own Applesoft program, and moving between them is one
 * program printing `^DRUN <name>` and DOS 3.3 going to the disk for the next. Measured on the
 * machine by `oracle/probe_runtime.mjs`, from the frame on which the line carrying the
 * `^DRUN` is current to the frame on which the next program is loaded and running:
 *
 * ```
 * STARSHIP SIMULATOR -> COM              1051 ms   (twice, to the frame)
 * COM -> STARSHIP SIMULATOR              1802 ms
 * COM -> GROUND FORCES            851 and 1669 ms
 * GROUND FORCES -> COM           1035 and 1018 ms
 * COM -> RADAR                           1001 ms
 * RADAR -> COM                           1151 ms
 * COM -> END                     1769 and 1752 ms
 * ```
 *
 * It is **not** a property of the program being loaded: COM to GROUND FORCES came out at 851
 * ms on one run and 1669 ms on the next, and END is 813 bytes yet costs as much as the 5,553
 * of the simulator. What is being paid for is the head - DOS seeks to the catalog to find the
 * file and then to wherever the file is - so it depends on what was read last, and a single
 * figure is the honest summary. Fourteen samples over two runs: 851 ms to 1802 ms, mean 1290,
 * median 1051.
 *
 * The 2200 ms this used to be was nobody's measurement, and removing it altogether was no
 * better in the other direction.
 *
 * One caveat, stated rather than papered over: a few of the port's scenes are not a `RUN` on
 * the disk. The ship identification screen is a `BLOAD` inside RADAR, and it pays the same
 * here, which overstates it - a BLOAD of one shape file is a smaller read than a program.
 */
export const SCENE_TRANSITION_MS = 1290;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SceneContext {
  hires: Hires;
  state: GameState;
  input: Input;
  audio: Audio;
  loader: Loader;
}

export type Scene = (ctx: SceneContext, scenes: SceneManager) => Promise<void> | void;

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private current: string | null = null;
  /** The first screen is not a `RUN` from anywhere - START is what the disk boots into. */
  private started = false;

  constructor(private ctx: SceneContext) {}

  register(name: string, scene: Scene): void {
    this.scenes.set(name.toLowerCase(), scene);
  }

  async run(name: string): Promise<void> {
    const key = name.toLowerCase();
    const scene = this.scenes.get(key);
    if (!scene) {
      console.warn(`[scene] not registered: ${name}`);
      return;
    }
    // The old screen stays up while the disk is read, which is what the machine does: DOS has
    // the drive, and nothing has redrawn yet. This used to be a rate limiter - a minimum gap
    // between transitions - which is a different thing: two scene changes in a row are two
    // RUNs on the disk and both are paid for.
    if (this.started) await wait(SCENE_TRANSITION_MS);
    this.started = true;
    this.current = key;
    setScene(key);
    glog('transition', `scene=${key}`);
    try {
      await scene(this.ctx, this);
    } catch (err) {
      console.error(`[scene] ${key} threw:`, err);
    }
  }

  get currentScene(): string | null {
    return this.current;
  }
}
