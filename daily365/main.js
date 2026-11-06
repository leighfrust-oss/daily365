// Main process: window, file storage, save/open dialogs.
// All app logic lives in renderer/. The renderer can only reach what preload.js exposes.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_DATA = () => ({
  startDate: null, // 'YYYY-MM-DD'; the renderer fills this on first run
  picks: [], // [{ day, song, artist, movie, year }]
  sound: { style: 'ticks', volume: 0.8 }, // style: 'ticks' | 'sweep' | 'off'
});

let lastSavedVideo = null;

function dataFile() {
  return path.join(app.getPath('userData'), 'daily365-data.json');
}

function loadData() {
  const defaults = DEFAULT_DATA();
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    return {
      ...defaults,
      ...saved,
      sound: { ...defaults.sound, ...(saved.sound || {}) },
      picks: Array.isArray(saved.picks) ? saved.picks : [],
    };
  } catch {
    return defaults;
  }
}

// Write to a temp file first so a crash mid-write cannot corrupt the real file.
function saveData(data) {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#0b0d10',
    title: 'Daily365',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Video is recorded in real time from the canvas, so never pause drawing.
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_e, data) => saveData(data));

ipcMain.handle('video:save', async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const ext = payload.ext === 'mp4' ? 'mp4' : 'webm';
  const name = path.basename(String(payload.defaultName || `daily365.${ext}`));
  const result = await dialog.showSaveDialog(win, {
    title: 'Save video',
    defaultPath: path.join(app.getPath('videos'), name),
    filters: [{ name: ext === 'mp4' ? 'MP4 video' : 'WebM video', extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, Buffer.from(payload.buffer));
  lastSavedVideo = result.filePath;
  return { saved: true, filePath: result.filePath };
});

// Only the file we just saved can be revealed, nothing the renderer names.
ipcMain.handle('video:reveal', () => {
  if (lastSavedVideo) shell.showItemInFolder(lastSavedVideo);
  return Boolean(lastSavedVideo);
});

// Import a picks list in the same shape as sample/picks-sample.json.
ipcMain.handle('picks:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Import picks',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    if (!Array.isArray(parsed)) return { ok: false, error: 'The file must contain a list of picks.' };
    return { ok: true, picks: parsed };
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
});

// Export all picks as a JSON file (a backup, or a way to move picks to the phone app).
ipcMain.handle('picks:export', async (event, picks) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Export picks',
    defaultPath: path.join(app.getPath('documents'), 'daily365-picks.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, JSON.stringify(Array.isArray(picks) ? picks : [], null, 2), 'utf8');
  return { saved: true, filePath: result.filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
