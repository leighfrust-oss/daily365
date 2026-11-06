// Everything that differs between the Windows (Electron) app and the browser / Android app.
// app.js only talks to `platform`, so all other code is shared between both.
// To add a feature that needs the OS: add it to both branches below (and to preload.js + main.js).
const electron = window.daily365;
export const isElectron = Boolean(electron);

const STORAGE_KEY = 'daily365-data';
const defaults = () => ({ startDate: null, picks: [], sound: { style: 'ticks', volume: 0.8 } });

let lastVideoFile = null;
let installPrompt = null;

const web = {
  async init() {
    // Ask the browser not to clear our saved picks when the phone is low on space.
    try {
      await navigator.storage.persist();
    } catch {
      /* not supported, fine */
    }
    // Service worker = works offline and makes the app installable. Needs https (or localhost).
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      window.dispatchEvent(new Event('daily365-installable'));
    });
  },

  async loadData() {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        return {
          ...base,
          ...saved,
          sound: { ...base.sound, ...(saved.sound || {}) },
          picks: Array.isArray(saved.picks) ? saved.picks : [],
        };
      }
    } catch {
      /* first run or unreadable: start fresh */
    }
    return base;
  },

  async saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  // Downloads the clip. On Android it lands in Downloads and shows in the gallery.
  async saveVideo({ buffer, ext, defaultName }) {
    lastVideoFile = new File([buffer], defaultName, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
    const url = URL.createObjectURL(lastVideoFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { saved: true, message: `Downloaded ${defaultName}. Check your Downloads folder.` };
  },

  // Share sheet (TikTok, Instagram, WhatsApp...). It needs a fresh tap, so it is a button, not automatic.
  postSaveAction() {
    if (!lastVideoFile || !navigator.canShare || !navigator.canShare({ files: [lastVideoFile] })) return null;
    return {
      label: 'Share video',
      run: async () => {
        try {
          await navigator.share({ files: [lastVideoFile], title: 'Daily365' });
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      },
    };
  },

  // Same JSON format as sample/picks-sample.json.
  importPicks() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return resolve({ ok: false, canceled: true });
        try {
          const parsed = JSON.parse(await file.text());
          if (!Array.isArray(parsed)) return resolve({ ok: false, error: 'The file must contain a list of picks.' });
          resolve({ ok: true, picks: parsed });
        } catch {
          resolve({ ok: false, error: 'That file is not valid JSON.' });
        }
      };
      input.oncancel = () => resolve({ ok: false, canceled: true });
      input.click();
    });
  },

  // Backup, or a way to move picks between the PC and the phone (Export here, Import there).
  async exportPicks(picks) {
    const file = new File([JSON.stringify(picks, null, 2)], 'daily365-picks.json', { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { saved: true };
  },

  // Calls back when the browser says the app can be installed. Gives you a function that shows the install prompt.
  onInstallAvailable(callback) {
    const fire = () => callback(() => installPrompt && installPrompt.prompt());
    if (installPrompt) fire();
    window.addEventListener('daily365-installable', fire);
  },
};

const desktop = isElectron
  ? {
      async init() {},
      loadData: () => electron.loadData(),
      saveData: (data) => electron.saveData(data),
      saveVideo: (payload) => electron.saveVideo(payload),
      postSaveAction: () => ({ label: 'Show in folder', run: () => electron.revealVideo() }),
      importPicks: () => electron.importPicks(),
      exportPicks: (picks) => electron.exportPicks(picks),
      onInstallAvailable() {},
    }
  : null;

export const platform = { isElectron, ...(desktop || web) };
