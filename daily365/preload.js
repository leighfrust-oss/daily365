// The only bridge between the UI and the main process.
// To add a feature that needs the OS, add an ipcMain handler in main.js and expose it here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daily365', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  saveVideo: (payload) => ipcRenderer.invoke('video:save', payload),
  revealVideo: () => ipcRenderer.invoke('video:reveal'),
  importPicks: () => ipcRenderer.invoke('picks:import'),
  exportPicks: (picks) => ipcRenderer.invoke('picks:export', picks),
});
