// Draws one frame of the vertical video (1080 x 1920).
// Pure drawing: no DOM, no audio, no stored state. Give it a view and a time, it paints a frame.
// The same function drives the on-screen preview and the recording, so they always match.

export const W = 1080;
export const H = 1920;
export const TOTAL_DAYS = 365;

// Timeline in milliseconds. Edit these numbers to change the pacing of the whole video.
export const TL = {
  fillStart: 400, // bar starts at 0 and begins to fill
  fillEnd: 3600, // bar reaches today's day
  songIn: 3900, // song card appears
  movieIn: 4900, // movie card appears
  total: 7000, // everything stays on screen until here
};

const COLORS = {
  bg: '#090a0c',
  panel: '#0f1216',
  line: '#23272e',
  track: '#1c2026',
  text: '#e6e8eb',
  dim: '#7a828e',
  faint: '#4b525c',
  red: '#ff3b3b',
  redDim: '#5a1d1d',
  redDeep: '#1a0d0f',
  redLine: '#3a1518',
};
const MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';
const SANS = '"Segoe UI", system-ui, -apple-system, sans-serif';
const M = 70; // side margin

export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 0..1 amount of the bar that is filled at time t. The sound engine uses the same curve.
export const fillAmount = (t) => easeOutCubic(clamp01((t - TL.fillStart) / (TL.fillEnd - TL.fillStart)));

// Icons are Tabler outline paths (MIT), drawn as strokes on a 24 x 24 grid.
const ICONS = {
  song: [
    'M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
    'M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
    'M9 17v-13h10v13',
    'M9 8h10',
  ].map((d) => new Path2D(d)),
  movie: [
    'M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M8 4l0 16',
    'M16 4l0 16',
    'M4 8l4 0',
    'M4 16l4 0',
    'M4 12l16 0',
    'M16 8l4 0',
    'M16 16l4 0',
  ].map((d) => new Path2D(d)),
};

// view = { day, song: { title, artist }, movie: { title, year }, live }
// live = true while recording or playing, false for the idle preview.
export function drawFrame(ctx, view, t) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  drawHud(ctx, view.live, t);
  drawProgress(ctx, view.day, t);
  drawPick(ctx, {
    kind: 'song',
    y: 880,
    label: 'SONG OF THE DAY',
    title: view.song.title,
    sub: view.song.artist,
    placeholder: 'Add a song',
    appearAt: TL.songIn,
  }, t);
  drawPick(ctx, {
    kind: 'movie',
    y: 1160,
    label: 'MOVIE OF THE DAY',
    title: view.movie.title,
    sub: view.movie.year,
    placeholder: 'Add a movie',
    appearAt: TL.movieIn,
  }, t);
  ctx.restore();
}

function drawHud(ctx, live, t) {
  const y = 130;
  const blinkOn = Math.floor(t / 500) % 2 === 0;
  ctx.fillStyle = live ? (blinkOn ? COLORS.red : COLORS.redDim) : COLORS.faint;
  ctx.beginPath();
  ctx.arc(M + 10, y - 12, 10, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, live ? 'REC' : 'PREVIEW', M + 36, y, `34px ${MONO}`, COLORS.dim);
  const shown = live ? Math.min(t, TL.total) : 0;
  drawText(ctx, timecode(shown), W - M, y, `34px ${MONO}`, COLORS.dim, 'right');
}

function timecode(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

function drawProgress(ctx, day, t) {
  const value = day * fillAmount(t); // in days, counts up from 0
  const trackW = W - M * 2;

  drawText(ctx, 'DAY', M, 330, `34px ${MONO}`, COLORS.dim);

  // Right-align the counting number so " / 365" never shifts while digits change.
  const bigFont = `500 170px ${MONO}`;
  ctx.font = bigFont;
  const numRight = M + ctx.measureText(String(TOTAL_DAYS)).width;
  drawText(ctx, String(Math.round(value)), numRight, 510, bigFont, COLORS.text, 'right');
  drawText(ctx, `/ ${TOTAL_DAYS}`, numRight + 24, 510, `60px ${MONO}`, COLORS.dim);
  drawText(ctx, `${Math.round((value / TOTAL_DAYS) * 100)}%`, W - M, 510, `500 64px ${MONO}`, COLORS.red, 'right');

  const trackY = 570;
  const trackH = 14;
  ctx.fillStyle = COLORS.track;
  ctx.beginPath();
  ctx.roundRect(M, trackY, trackW, trackH, 7);
  ctx.fill();

  const fillW = (trackW * value) / TOTAL_DAYS;
  if (fillW > 0.5) {
    ctx.fillStyle = COLORS.red;
    ctx.beginPath();
    ctx.roundRect(M, trackY, fillW, trackH, Math.min(7, fillW / 2));
    ctx.fill();
  }

  const marks = [0, 91, 183, 274, 365];
  for (const mark of marks) {
    const x = M + (trackW * mark) / TOTAL_DAYS;
    if (mark > 0 && mark < TOTAL_DAYS) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(x - 1, trackY + 28, 2, 12);
    }
    const align = mark === 0 ? 'left' : mark === TOTAL_DAYS ? 'right' : 'center';
    drawText(ctx, String(mark), x, trackY + 78, `28px ${MONO}`, COLORS.faint, align);
  }
}

function drawPick(ctx, p, t) {
  const a = easeOutCubic(clamp01((t - p.appearAt) / 450));
  if (a <= 0) return;

  const x = M;
  const w = W - M * 2;
  const h = 230;
  const y = p.y + (1 - a) * 30;

  ctx.save();
  ctx.globalAlpha = a;

  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.stroke();

  const box = 130;
  const bx = x + 40;
  const by = y + (h - box) / 2;
  ctx.fillStyle = COLORS.redDeep;
  ctx.strokeStyle = COLORS.redLine;
  ctx.beginPath();
  ctx.roundRect(bx, by, box, box, 24);
  ctx.fill();
  ctx.stroke();
  drawIcon(ctx, p.kind, bx + box / 2, by + box / 2, 64);

  const tx = x + 210;
  const maxW = w - 210 - 40;
  drawText(ctx, p.label, tx, y + 78, `28px ${MONO}`, COLORS.red);

  const titleFont = `500 54px ${SANS}`;
  const hasTitle = Boolean(p.title && p.title.trim());
  drawText(ctx, fitText(ctx, hasTitle ? p.title : p.placeholder, maxW, titleFont), tx, y + 140, titleFont, hasTitle ? COLORS.text : COLORS.faint);

  if (p.sub && p.sub.trim()) {
    const subFont = `32px ${MONO}`;
    drawText(ctx, fitText(ctx, p.sub, maxW, subFont), tx, y + 190, subFont, COLORS.dim);
  }
  ctx.restore();
}

function drawIcon(ctx, kind, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.translate(-12, -12);
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of ICONS[kind]) ctx.stroke(path);
  ctx.restore();
}

function drawText(ctx, str, x, y, font, color, align = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

// Shortens text with an ellipsis so it never runs past maxW.
function fitText(ctx, str, maxW, font) {
  ctx.font = font;
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}
