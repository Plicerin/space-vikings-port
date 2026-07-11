export interface LogEntry {
  time: number;
  wallTime: string;
  easternTime?: string;
  scene: string;
  event: string;
  detail?: string;
}

const MAX_ENTRIES = 2000;
const STORAGE_KEY = 'space_vikings_event_log';

const entries: LogEntry[] = loadFromStorage();
let currentScene = '';

const TACTICAL_EVENT_COOLDOWN = 1000; // ms
const lastTacticalLogTime = new Map<string, number>();

function loadFromStorage(): LogEntry[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.warn('Failed to load log from storage', e);
  }
  return [];
}

let saveTimeout: any = null;

function saveToStorage() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Failed to save log to storage', e);
    }
    saveTimeout = null;
  }, 500);
}

export function setScene(name: string) {
  currentScene = name;
  log('enter', name);
}

export function log(event: string, detail?: string) {
  const now = performance.now();
  
  // Global cooldown for high-frequency tactical events
  if (['ai', 'fire', 'hit', 'transition', 'enemyAttack'].includes(event)) {
    const last = lastTacticalLogTime.get(event) ?? 0;
    if (now - last < TACTICAL_EVENT_COOLDOWN) return;
    lastTacticalLogTime.set(event, now);
  }

  entries.push({
    time: now,
    wallTime: new Date().toISOString(),
    easternTime: new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    scene: currentScene,
    event,
    detail,
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  saveToStorage();
  updateStatus(event, detail);
}

function updateStatus(event: string, detail?: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('cpu-status');
  if (!el) return;
  
  if (event === 'ai') {
    el.innerText = `> ${detail?.toUpperCase()}`;
  } else if (event === 'fire') {
    el.innerText = `> ENGAGING TARGET: ${detail?.toUpperCase()}`;
  } else if (event === 'enter') {
    el.innerText = `> ENTERING SECTOR: ${detail?.toUpperCase()}`;
  }
}

export function initCopyButton() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('copy-log-btn');
  if (!btn) return;
  
  btn.onclick = async () => {
    const text = JSON.stringify(entries, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      const old = btn.innerText;
      btn.innerText = 'COPIED!';
      btn.style.background = '#ffffff';
      setTimeout(() => {
        btn.innerText = old;
        btn.style.background = '#00ffff';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy log', err);
      alert('Failed to copy log to clipboard.');
    }
  };
}

export function getLog(): readonly LogEntry[] {
  return entries;
}

export function clearLog() {
  entries.length = 0;
  lastTacticalLogTime.clear();
  saveToStorage();
}

export function dumpLog(): string {
  return entries
    .map((e) => `${e.time.toFixed(0)} [${e.scene}] ${e.event}${e.detail ? ': ' + e.detail : ''}`)
    .join('\n');
}

export function downloadLog() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `space_vikings_log_${new Date().getTime()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

if (typeof window !== 'undefined') {
  (window as any).__gameLog = { log, getLog, dumpLog, clearLog, setScene, downloadLog };
}
