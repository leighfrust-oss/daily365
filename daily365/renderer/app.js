// UI controller: Create tab (preview, edit today's picks, record) and Plan tab (all 365 days).
// Drawing lives in render.js, sound in audio.js, recording in recorder.js.
import { drawFrame, TL, TOTAL_DAYS } from './render.js';
import { SoundEngine, SOUND_STYLES } from './audio.js';
import { pickMimeType, extensionFor, startRecording } from './recorder.js';
import { platform } from './platform.js';

const $ =(id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const sound = new SoundEngine();

const picks = new Map(); // day number -> { day, song, artist, movie, year }
let data = null; // whole saved file: { startDate, picks, sound }
let currentDay = 1;
let busy = false;
let stopRequested = false;
let activeSound = null;
let postSave = null; // { label, run } shown as a button after a clip is saved (Share video / Show in folder)

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
const clampDay = (n) => Math.min(TOTAL_DAYS, Math.max(1, Math.round(Number(n)) || 1));
const localDateString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcMs = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
// Day 1 is the start date. Before the start it shows day 1, after day 365 it stays on 365.
const todayDay = () => clampDay(Math.round((utcMs(localDateString()) - utcMs(data.startDate)) / 86400000) + 1);
const dateForDay = (day) => new Date(utcMs(data.startDate) + (day - 1) * 86400000);
const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// ---------- picks and saving ----------
const str = (v) => (v == null ? '' : String(v));
const emptyPick = (day) => ({ day, song: '', artist: '', movie: '', year: '' });
const getPick = (day) => picks.get(day) || emptyPick(day);
const isFilled = (p) => Boolean(p.song.trim() && p.movie.trim());

function mergePicks(list) {
  let count = 0;
  for (const p of list) {
    const n = Number(p && p.day);
    if (!Number.isFinite(n) || n < 1 || n > TOTAL_DAYS) continue;
    const day = Math.round(n);
    picks.set(day, { day, song: str(p.song), artist: str(p.artist), movie: str(p.movie), year: str(p.year) });
    count++;
  }
  return count;
}

function setPickField(day, field, value) {
  const p = picks.get(day) || emptyPick(day);
  p[field] = value;
  picks.set(day, p);
  scheduleSave();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
const picksList = () =>
  [...picks.values()].filter((p) => p.song || p.artist || p.movie || p.year).sort((a, b) => a.day - b.day);

function flushSave() {
  clearTimeout(saveTimer);
  data.picks = picksList();
  return platform.saveData(data);
}
// Phones often skip beforeunload, so also save when the app goes to the background.
window.addEventListener('beforeunload', () => {
  flushSave();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// ---------- Create tab ----------
function currentView(live) {
  const p = getPick(currentDay);
  return { day: currentDay, song: { title: p.song, artist: p.artist }, movie: { title: p.movie, year: p.year }, live };
}
const drawIdle = () => drawFrame(ctx, currentView(false), TL.total);

function syncForm() {
  const p = getPick(currentDay);
  $('dayInput').value = currentDay;
  $('song').value = p.song;
  $('artist').value = p.artist;
  $('movie').value = p.movie;
  $('year').value = p.year;
  const today = todayDay();
  $('dayInfo').textContent = `${fmtDate(dateForDay(currentDay))} · today is day ${today}`;
  $('btnCreate').textContent = currentDay === today ? 'Create today’s video' : `Create day ${currentDay} video`;
  drawIdle();
}

function goToDay(day) {
  currentDay = clampDay(day);
  syncForm();
}

function bindCreate() {
  $('dayMinus').onclick = () => goToDay(currentDay - 1);
  $('dayPlus').onclick = () => goToDay(currentDay + 1);
  $('dayToday').onclick = () => goToDay(todayDay());
  $('dayInput').onchange = (e) => goToDay(e.target.value);

  for (const field of ['song', 'artist', 'movie', 'year']) {
    $(field).addEventListener('input', (e) => {
      setPickField(currentDay, field, e.target.value);
      if (!busy) drawIdle();
    });
  }

  const styleSelect = $('soundStyle');
  for (const s of SOUND_STYLES) styleSelect.add(new Option(s.label, s.id));
  styleSelect.value = data.sound.style;
  styleSelect.onchange = () => {
    data.sound.style = styleSelect.value;
    scheduleSave();
  };

  const volume = $('volume');
  volume.value = Math.round(data.sound.volume * 100);
  $('volumeOut').textContent = `${volume.value}%`;
  volume.oninput = () => {
    data.sound.volume = volume.value / 100;
    sound.setVolume(data.sound.volume);
    $('volumeOut').textContent = `${volume.value}%`;
    scheduleSave();
  };

  $('soundTest').onclick = () => {
    sound.ensure();
    sound.play(data.sound.style, { day: 30, startAt: sound.now() + 0.05, fillDelay: 0, fillDuration: 1.4 });
  };

  $('btnPreview').onclick = () => {
    if (busy) stopRequested = true;
    else playClip({ record: false });
  };
  $('btnCreate').onclick = () => playClip({ record: true });
  $('btnPostSave').onclick = async () => {
    try {
      await postSave.run();
    } catch (err) {
      setStatus(`Something went wrong: ${err && err.message ? err.message : err}`, 'error');
    }
  };
}

function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}

function setBusy(on, record) {
  busy = on;
  $('btnCreate').disabled = on;
  $('soundTest').disabled = on;
  $('btnPreview').textContent = on && !record ? 'Stop' : 'Preview';
  $('btnPreview').disabled = on && record;
}

// Plays the whole timeline once. With record = true it also records the canvas and sound,
// then asks for a place to save the file. The bar always starts at 0 and fills up to the day.
async function playClip({ record }) {
  if (busy) return;

  const pick = getPick(currentDay);
  if (record && !isFilled(pick)) {
    setStatus(`Add a song and a movie for day ${currentDay} first.`, 'error');
    $(pick.song.trim() ? 'movie' : 'song').focus();
    return;
  }

  $('btnPostSave').classList.add('hidden');
  stopRequested = false;
  setBusy(true, record);

  const view = currentView(true);
  const audioCtx = sound.ensure();
  let recording = null;
  let mime = '';
  let wakeLock = null;
  let wasHidden = false;

  try {
    // Keeps a phone screen from turning off mid-recording.
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      /* not supported or denied: carry on */
    }
    if (record) {
      mime = pickMimeType();
      const videoTracks = canvas.captureStream(30).getVideoTracks();
      const stream = new MediaStream([...videoTracks, ...sound.recordStream.getAudioTracks()]);
      drawFrame(ctx, view, 0);
      recording = startRecording(stream, mime);
      setStatus('Recording. Keep this screen open for about 7 seconds.');
    } else {
      setStatus('Playing preview.');
    }

    const leadMs = 150; // gives the audio a head start so sound and picture line up
    activeSound = sound.play(data.sound.style, {
      day: view.day,
      startAt: audioCtx.currentTime + leadMs / 1000,
      fillDelay: TL.fillStart / 1000,
      fillDuration: (TL.fillEnd - TL.fillStart) / 1000,
    });

    const startedAt = performance.now() + leadMs;
    const endMs = TL.total + (record ? 400 : 0);
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - startedAt;
        if (document.hidden) wasHidden = true;
        if (stopRequested || t >= endMs) return resolve();
        drawFrame(ctx, view, Math.max(0, t));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (stopRequested) {
      activeSound.stop();
      if (recording) await recording.stop();
      setStatus('Stopped.');
      return;
    }

    if (record) {
      setStatus('Saving…');
      const blob = await recording.stop();
      const ext = extensionFor(blob.type || mime);
      const result = await platform.saveVideo({
        buffer: await blob.arrayBuffer(),
        ext,
        defaultName: `daily365-day-${String(view.day).padStart(3, '0')}.${ext}`,
      });
      if (result.saved) {
        const warning = wasHidden ? ' The app was in the background while recording, so the clip may be cut. Record again and stay on this screen.' : '';
        setStatus((result.message || `Saved: ${result.filePath}`) + warning, wasHidden ? 'error' : 'ok');
        postSave = platform.postSaveAction();
        if (postSave) {
          $('btnPostSave').textContent = postSave.label;
          $('btnPostSave').classList.remove('hidden');
        }
      } else {
        setStatus('Save canceled. The clip was not kept.');
      }
    } else {
      setStatus('Preview finished.');
    }
  } catch (err) {
    setStatus(`Something went wrong: ${err && err.message ? err.message : err}`, 'error');
  } finally {
    try {
      if (wakeLock) await wakeLock.release();
    } catch {
      /* already released */
    }
    activeSound = null;
    setBusy(false, record);
    drawIdle();
  }
}

// ---------- Plan tab ----------
const FIELDS = ['song', 'artist', 'movie', 'year'];
const LABELS = { song: 'Song', artist: 'Artist', movie: 'Movie', year: 'Year' };
let planBuilt = false;

function buildPlan() {
  const frag = document.createDocumentFragment();
  for (let day = 1; day <= TOTAL_DAYS; day++) {
    const tr = document.createElement('tr');
    tr.dataset.day = day;
    tr.innerHTML =
      `<td class="c-day"><button class="link" data-open="${day}">${day}</button></td>` +
      '<td class="c-date"></td>' +
      FIELDS.map((f) => `<td><input type="text" data-field="${f}" placeholder="${LABELS[f]}" spellcheck="false"></td>`).join('');
    frag.append(tr);
  }
  $('planBody').append(frag);

  $('planBody').addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    setPickField(Number(e.target.closest('tr').dataset.day), field, e.target.value);
    updateFilled();
  });
  $('planBody').addEventListener('click', (e) => {
    const day = e.target.dataset.open;
    if (day) {
      currentDay = clampDay(day);
      showView('create');
    }
  });

  $('startDate').onchange = (e) => {
    if (!e.target.value) return;
    data.startDate = e.target.value;
    scheduleSave();
    currentDay = todayDay();
    refreshPlan();
  };
  $('btnJump').onclick = () => {
    const row = $('planBody').querySelector(`tr[data-day="${todayDay()}"]`);
    if (row) row.scrollIntoView({ block: 'center' });
  };
  $('btnImport').onclick = async () => {
    const res = await platform.importPicks();
    if (res.canceled) return;
    if (!res.ok) {
      $('planMsg').textContent = res.error;
      return;
    }
    const count = mergePicks(res.picks);
    scheduleSave();
    refreshPlan();
    $('planMsg').textContent = `Imported ${count} pick${count === 1 ? '' : 's'}.`;
  };
  $('btnExport').onclick = async () => {
    const list = picksList();
    const res = await platform.exportPicks(list);
    if (res.saved) $('planMsg').textContent = `Exported ${list.length} picks${res.filePath ? ` to ${res.filePath}` : ''}.`;
  };
  planBuilt = true;
}

function updateFilled() {
  let filled = 0;
  for (const p of picks.values()) if (isFilled(p)) filled++;
  $('filled').textContent = `${filled} / ${TOTAL_DAYS} days filled`;
}

function refreshPlan() {
  if (!planBuilt) buildPlan();
  const today = todayDay();
  $('startDate').value = data.startDate;
  for (const tr of $('planBody').rows) {
    const day = Number(tr.dataset.day);
    const p = getPick(day);
    tr.classList.toggle('today', day === today);
    tr.querySelector('.c-date').textContent = fmtDate(dateForDay(day));
    for (const f of FIELDS) tr.querySelector(`[data-field="${f}"]`).value = p[f];
  }
  updateFilled();
}

// ---------- tabs and startup ----------
function showView(name) {
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.view === name);
  $('view-create').classList.toggle('hidden', name !== 'create');
  $('view-plan').classList.toggle('hidden', name !== 'plan');
  if (name === 'plan') {
    $('planMsg').textContent = '';
    refreshPlan();
  } else {
    syncForm();
  }
}

async function init() {
  await platform.init();
  data = await platform.loadData();
  platform.onInstallAvailable((showPrompt) => {
    $('btnInstall').classList.remove('hidden');
    $('btnInstall').onclick = showPrompt;
  });
  if (!data.startDate) {
    data.startDate = localDateString();
    flushSave();
  }
  mergePicks(data.picks);
  sound.setVolume(data.sound.volume);
  currentDay = todayDay();

  for (const tab of document.querySelectorAll('.tab')) tab.onclick = () => showView(tab.dataset.view);
  bindCreate();
  syncForm();
}

init();
