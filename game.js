'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

const themeToggle = document.getElementById('theme-toggle');

// Colores del canvas que dependen del tema (se actualizan en applyTheme)
let gridColor = '#22222e';
let highlightColor = 'rgba(255,255,255,0.12)';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false; // el juego no corre hasta pulsar Jugar

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  trackCombo(cleared);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  finishRecords();
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() puede ejecutarse dentro de este mismo frame (lockPiece -> spawn);
  // si reprogramáramos igual, el loop sobrescribiría el cancelAnimationFrame y seguiría vivo.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  resetRecordsRun();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  // Con el input de nombre enfocado no se procesan teclas de juego (Space/P incluidos)
  if (document.activeElement === recName) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  themeToggle.textContent = light ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(light));
  gridColor = light ? '#e1e5ee' : '#22222e';
  highlightColor = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
  // En pausa/game over el loop está detenido: repintar manualmente
  if (board) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el botón
});

// ---- Récords ----
const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const recOver = document.getElementById('rec-over');
const recNewMsg = document.getElementById('rec-new-msg');
const recForm = document.getElementById('rec-form');
const recName = document.getElementById('rec-name');

let records = [];
let stats = { bestCombo: 0, maxLines: 0 };
let combo = 0;            // piezas consecutivas que limpian líneas
let runBestCombo = 0;     // mejor combo de la partida actual
let pendingRecord = null; // récord de esta partida aún sin guardar

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (Array.isArray(raw)) {
      records = raw
        .filter(r => r && typeof r.name === 'string' && Number.isFinite(r.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS);
    }
  } catch (e) { records = []; }
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (s) stats = {
      bestCombo: Number.isFinite(s.bestCombo) ? s.bestCombo : 0,
      maxLines: Number.isFinite(s.maxLines) ? s.maxLines : 0,
    };
  } catch (e) { stats = { bestCombo: 0, maxLines: 0 }; }
}

function persistRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* sin almacenamiento */ }
}

function persistStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* sin almacenamiento */ }
}

function qualifiesForTop(s) {
  return s > 0 && (records.length < MAX_RECORDS || s > records[records.length - 1].score);
}

function renderRecordList(listEl, highlight) {
  listEl.textContent = '';
  if (!records.length) {
    const li = document.createElement('li');
    li.className = 'rec-empty';
    li.textContent = 'Aún no hay récords';
    listEl.appendChild(li);
    return;
  }
  records.forEach((r, i) => {
    const li = document.createElement('li');
    if (r === highlight) li.classList.add('rec-highlight');
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = `${i + 1}. ${r.name}`;
    const sc = document.createElement('span');
    sc.className = 'rec-score';
    sc.textContent = r.score.toLocaleString();
    li.append(name, sc);
    li.title = `${r.lines} líneas · nivel ${r.level} · ${r.date}`;
    listEl.appendChild(li);
  });
}

function statsText() {
  return `Mejor combo: ${stats.bestCombo} · Líneas máx.: ${stats.maxLines}`;
}

function renderRecords(highlight) {
  renderRecordList(document.getElementById('rec-start-list'), highlight);
  renderRecordList(document.getElementById('rec-over-list'), highlight);
  document.getElementById('rec-start-stats').textContent = statsText();
  document.getElementById('rec-over-stats').textContent = statsText();
}

function trackCombo(cleared) {
  if (cleared) {
    combo++;
    if (combo > runBestCombo) runBestCombo = combo;
  } else {
    combo = 0;
  }
}

function resetRecordsRun() {
  combo = 0;
  runBestCombo = 0;
  pendingRecord = null;
  recOver.classList.add('hidden');
  recForm.classList.add('hidden');
  recNewMsg.classList.add('hidden');
}

function finishRecords() {
  if (runBestCombo > stats.bestCombo) stats.bestCombo = runBestCombo;
  if (lines > stats.maxLines) stats.maxLines = lines;
  persistStats();
  pendingRecord = qualifiesForTop(score)
    ? { name: '', score, lines, level, date: new Date().toISOString().slice(0, 10) }
    : null;
  renderRecords(null);
  recOver.classList.remove('hidden');
  recNewMsg.classList.toggle('hidden', !pendingRecord);
  recForm.classList.toggle('hidden', !pendingRecord);
  if (pendingRecord) {
    recName.value = '';
    // el overlay se muestra después de endGame(); enfocar cuando ya sea visible
    setTimeout(() => { if (pendingRecord) recName.focus(); }, 0);
  }
}

recForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const rec = pendingRecord;
  pendingRecord = null;
  rec.name = recName.value.trim().slice(0, 12) || 'Anónimo';
  records.push(rec);
  records.sort((a, b) => b.score - a.score);
  records = records.slice(0, MAX_RECORDS);
  persistRecords();
  recForm.classList.add('hidden');
  recNewMsg.classList.add('hidden');
  recName.blur();
  renderRecords(rec);
});

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  records = [];
  stats = { bestCombo: 0, maxLines: 0 };
  try { localStorage.removeItem(RECORDS_KEY); localStorage.removeItem(STATS_KEY); } catch (e) { /* sin almacenamiento */ }
  pendingRecord = null;
  recForm.classList.add('hidden');
  recNewMsg.classList.add('hidden');
  renderRecords(null);
}

['rec-start-reset', 'rec-over-reset'].forEach(id => {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => { resetRecords(); btn.blur(); });
});

startBtn.addEventListener('click', () => {
  startBtn.blur();
  started = true;
  startScreen.classList.add('hidden');
  init();
});

loadRecords();
renderRecords(null);
