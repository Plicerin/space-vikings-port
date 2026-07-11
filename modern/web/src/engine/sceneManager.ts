import { Hires } from './hires';
import { GameState } from './gameState';
import { Input } from './input';
import { Audio } from './audio';
import { Loader } from './loader';
import { setScene, log as glog } from './gameLog';

const SCENE_TRANSITION_MS = 2200;

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

let lastTransitionAt = 0;

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private current: string | null = null;

  constructor(private ctx: SceneContext) {}

  register(name: string, scene: Scene): void {
    this.scenes.set(name.toLowerCase(), scene);
  }

  async run(name: string): Promise<void> {
    const now = performance.now();
    const sinceLast = now - lastTransitionAt;
    if (lastTransitionAt > 0 && sinceLast < SCENE_TRANSITION_MS) {
      await wait(SCENE_TRANSITION_MS - sinceLast);
    }

    const key = name.toLowerCase();
    const scene = this.scenes.get(key);
    if (!scene) {
      console.warn(`[scene] not registered: ${name}`);
      return;
    }
    lastTransitionAt = performance.now();
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
