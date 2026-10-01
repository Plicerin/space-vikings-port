/**
 * The switch itself: a button in the corner of the viewport and the list it opens.
 *
 * It is built from `QOL_FEATURES`, so a new switch needs nothing here.
 *
 * The one thing it has to be careful about is the keyboard. The game reads keys straight off
 * `window`, and a focused `<button>` or `<input>` answers Space and Return itself - so every
 * control blurs the moment it is used, and key events inside the panel are stopped before they
 * reach the game.
 */
import { QOL_FEATURES, qolOn, setQol, resetQol, qolSummary } from './qol';

const PANEL_ID = 'qol-panel';

export function mountQolPanel(host: HTMLElement): void {
  if (document.getElementById(PANEL_ID)) return;

  const style = document.createElement('style');
  style.textContent = `
    #qol-toggle {
      position: absolute; top: 8px; right: 8px; z-index: 40;
      font: 11px/1 "Consolas", ui-monospace, monospace; letter-spacing: 0.12em;
      color: #8fb7d9; background: rgba(0,0,0,0.55); border: 1px solid #27506e;
      padding: 6px 9px; cursor: pointer; opacity: 0.45; transition: opacity 120ms;
    }
    #qol-toggle:hover, #qol-toggle[aria-expanded="true"] { opacity: 1; }
    #${PANEL_ID} {
      position: absolute; top: 34px; right: 8px; z-index: 40; display: none;
      min-width: 232px; padding: 10px 12px 12px;
      background: rgba(0,0,0,0.88); border: 1px solid #27506e;
      font: 12px/1.45 "Consolas", ui-monospace, monospace; color: #cfe2f2;
    }
    #${PANEL_ID}[data-open="1"] { display: block; }
    #${PANEL_ID} h4 {
      margin: 8px 0 4px; font-size: 10px; font-weight: normal;
      letter-spacing: 0.18em; color: #6f93ae; text-transform: uppercase;
    }
    #${PANEL_ID} h4:first-child { margin-top: 0; }
    #${PANEL_ID} label {
      display: flex; align-items: center; gap: 8px; padding: 2px 0; cursor: pointer;
    }
    #${PANEL_ID} .qol-foot {
      margin-top: 10px; padding-top: 8px; border-top: 1px solid #1b3a52;
      display: flex; align-items: center; justify-content: space-between;
    }
    #${PANEL_ID} .qol-state { color: #6f93ae; font-size: 10px; }
    #${PANEL_ID} button {
      font: 10px/1 "Consolas", ui-monospace, monospace; letter-spacing: 0.1em;
      color: #8fb7d9; background: transparent; border: 1px solid #27506e;
      padding: 4px 7px; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.id = 'qol-toggle';
  toggle.type = 'button';
  toggle.textContent = 'QOL';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.title = 'Additions the Apple II did not have. All off by default.';

  const panel = document.createElement('div');
  panel.id = PANEL_ID;

  const intro = document.createElement('div');
  intro.className = 'qol-state';
  intro.style.marginBottom = '8px';
  intro.textContent = 'Off is what the disk did.';
  panel.appendChild(intro);

  const state = document.createElement('span');
  state.className = 'qol-state';

  let group = '';
  for (const f of QOL_FEATURES) {
    if (f.group !== group) {
      group = f.group;
      const h = document.createElement('h4');
      h.textContent = group;
      panel.appendChild(h);
    }
    const label = document.createElement('label');
    label.title = f.note;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = qolOn(f.key);
    box.addEventListener('change', () => {
      setQol(f.key, box.checked);
      state.textContent = qolSummary();
      box.blur();
    });
    const text = document.createElement('span');
    text.textContent = f.label;
    label.appendChild(box);
    label.appendChild(text);
    panel.appendChild(label);
  }

  const foot = document.createElement('div');
  foot.className = 'qol-foot';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'ALL OFF';
  reset.addEventListener('click', () => {
    resetQol();
    for (const box of panel.querySelectorAll('input[type=checkbox]')) {
      (box as HTMLInputElement).checked = false;
    }
    state.textContent = qolSummary();
    reset.blur();
  });
  state.textContent = qolSummary();
  foot.appendChild(state);
  foot.appendChild(reset);
  panel.appendChild(foot);

  // Nothing typed at the panel should reach the game, and nothing clicked should keep the
  // focus that would let Space or Return work the control again.
  for (const ev of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(ev, (e) => e.stopPropagation());
    toggle.addEventListener(ev, (e) => e.stopPropagation());
  }

  toggle.addEventListener('click', () => {
    const open = panel.getAttribute('data-open') === '1';
    panel.setAttribute('data-open', open ? '0' : '1');
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    toggle.blur();
  });

  host.appendChild(toggle);
  host.appendChild(panel);
}
