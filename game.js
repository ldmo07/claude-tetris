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
  context.globalAlpha = alpha ?? 1;
  currentSkin.drawBlock(context, x, y, colorIndex, size); // ver sección Skins
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.gridColor || gridColor;
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
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
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

// ---- Skins ----
const SKIN_STORAGE_KEY = 'tetris.skin';
const skinSelect = document.getElementById('skin-select');

function skinPath(context, px, py, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(px, py, w, h, r);
    return;
  }
  // Fallback por paths para navegadores sin roundRect
  context.moveTo(px + r, py);
  context.lineTo(px + w - r, py);
  context.quadraticCurveTo(px + w, py, px + w, py + r);
  context.lineTo(px + w, py + h - r);
  context.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
  context.lineTo(px + r, py + h);
  context.quadraticCurveTo(px, py + h, px, py + h - r);
  context.lineTo(px, py + r);
  context.quadraticCurveTo(px, py, px + r, py);
  context.closePath();
}

const SKINS = {
  retro: {
    colors: COLORS,
    canvasBg: null, // null = fondo según tema claro/oscuro
    gridColor: null, // null = color de grid según tema
    drawBlock(context, x, y, i, size) {
      context.fillStyle = this.colors[i];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = highlightColor;
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#e0e0e0'],
    canvasBg: '#000000',
    gridColor: '#1a1a24',
    drawBlock(context, x, y, i, size) {
      const color = this.colors[i];
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.fillStyle = color + '55';
      context.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
      context.strokeRect(x * size + 3, y * size + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
    },
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#b8e8c4', '#f7b8b8', '#b8d4f7', '#ffd6a8', '#d8dfe3'],
    canvasBg: '#2b2a3a', // oscuro fijo: los pasteles no se leen sobre blanco
    gridColor: '#363547',
    drawBlock(context, x, y, i, size) {
      context.fillStyle = this.colors[i];
      skinPath(context, x * size + 2, y * size + 2, size - 4, size - 4, 8);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.45)';
      skinPath(context, x * size + 7, y * size + 5, size - 14, 5, 2.5);
      context.fill();
    },
  },
  pixel: {
    colors: [null, '#29b6c5', '#e0b400', '#8e44ad', '#43a047', '#d32f2f', '#3f7fd0', '#e67e22', '#78909c'],
    canvasBg: '#14141f',
    gridColor: '#1f1f2e',
    drawBlock(context, x, y, i, size) {
      const px = x * size + 1, py = y * size + 1, s = size - 2;
      const n = 5, cell = s / n;
      context.fillStyle = this.colors[i];
      context.fillRect(px, py, s, s);
      // Textura determinista de sub-celdas claras/oscuras
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = (r * 3 + c * 5 + i) % 7;
          if (v === 0) context.fillStyle = 'rgba(255,255,255,0.28)';
          else if (v === 3) context.fillStyle = 'rgba(0,0,0,0.25)';
          else continue;
          context.fillRect(px + c * cell, py + r * cell, cell, cell);
        }
      }
      context.strokeStyle = 'rgba(0,0,0,0.5)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    },
  },
};

let currentSkin = SKINS.retro;

function loadSkinPref() {
  try {
    const v = localStorage.getItem(SKIN_STORAGE_KEY);
    if (Object.prototype.hasOwnProperty.call(SKINS, v)) return v;
  } catch (e) { /* localStorage no disponible */ }
  return 'retro';
}

function applySkin(name) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, name)) name = 'retro';
  currentSkin = SKINS[name];
  skinSelect.value = name;
  const bg = currentSkin.canvasBg || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  // En pausa/game over el loop está detenido: repintar manualmente
  if (board) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem(SKIN_STORAGE_KEY, skinSelect.value); } catch (e) { /* ignorar */ }
  skinSelect.blur(); // evita que las flechas cambien el select durante el juego
});

init();
applySkin(loadSkinPref());
