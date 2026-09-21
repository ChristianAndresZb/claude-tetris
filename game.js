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
  '#b0bec5', // Nut - steel gray
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
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (hollow 3x3)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const CANVAS_THEMES = {
  dark: { gridColor: '#22222e', highlightColor: 'rgba(255,255,255,0.12)' },
  light: { gridColor: '#d0d0dd', highlightColor: 'rgba(255,255,255,0.5)' },
};

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
const themeToggleBtn = document.getElementById('theme-toggle');
const comboEl = document.getElementById('combo');
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const overlayRecords = document.getElementById('overlay-records');
const nameRow = document.getElementById('name-row');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');

const SCORES_KEY = 'highscores';
const MAX_SCORES = 5;
const MAX_NAME_LEN = 12;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = 'dark';
let combo = 0, maxCombo = 0;

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
    combo++;
    score += 50 * combo * level;
    maxCombo = Math.max(maxCombo, combo);
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
  const linesBefore = lines;
  merge();
  clearLines();
  if (lines === linesBefore) { combo = 0; updateHUD(); }
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
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = CANVAS_THEMES[theme].highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = CANVAS_THEMES[theme].gridColor;
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

  // the piece that failed to spawn must not be drawn over the stack
  if (gameOver) return;

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

function applyTheme(newTheme, { redraw = true } = {}) {
  theme = newTheme;
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  localStorage.setItem('theme', theme);
  if (redraw && current) {
    draw();
    drawNext();
  }
}

function toggleTheme() {
  applyTheme(theme === 'light' ? 'dark' : 'light');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  finishRecords();
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
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startOverlay.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  nameRow.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records (localStorage) ----

function defaultScores() {
  return { scores: [], bestCombo: 0, bestLines: 0 };
}

function isNum(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

function loadScores() {
  const data = defaultScores();
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY));
    if (!raw || typeof raw !== 'object') return data;
    if (Array.isArray(raw.scores)) {
      for (const s of raw.scores) {
        if (!s || typeof s !== 'object' || !isNum(s.score)) continue;
        data.scores.push({
          name: String(s.name ?? '').trim().slice(0, MAX_NAME_LEN) || 'Anónimo',
          score: s.score,
          lines: isNum(s.lines) ? s.lines : 0,
          level: isNum(s.level) ? s.level : 1,
          combo: isNum(s.combo) ? s.combo : 0,
        });
      }
      data.scores.sort((a, b) => b.score - a.score);
      data.scores = data.scores.slice(0, MAX_SCORES);
    }
    if (isNum(raw.bestCombo)) data.bestCombo = raw.bestCombo;
    if (isNum(raw.bestLines)) data.bestLines = raw.bestLines;
  } catch (e) {
    return defaultScores();
  }
  return data;
}

function saveScores(data) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(data));
  } catch (e) {
    // storage unavailable: records just aren't persisted
  }
}

function qualifiesForTop(data, s) {
  return s > 0 && (data.scores.length < MAX_SCORES || s > data.scores[data.scores.length - 1].score);
}

// Insert entry keeping the table sorted and capped; returns its row index
function insertScore(data, entry) {
  data.scores.push(entry);
  data.scores.sort((a, b) => b.score - a.score);
  data.scores = data.scores.slice(0, MAX_SCORES);
  return data.scores.indexOf(entry);
}

function renderScores(container, highlightIndex) {
  const data = loadScores();
  container.textContent = '';
  const title = document.createElement('p');
  title.className = 'records-title';
  title.textContent = 'RÉCORDS';
  container.appendChild(title);

  if (data.scores.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Sin récords todavía';
    container.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    data.scores.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i === highlightIndex) tr.className = 'highlight';
      [`${i + 1}.`, s.name, s.score.toLocaleString()].forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  const stats = document.createElement('p');
  stats.className = 'records-stats';
  stats.textContent = `Mejor combo: ${data.bestCombo} · Máx. líneas: ${data.bestLines}`;
  container.appendChild(stats);
}

// Game over: update bests, offer name entry if the score makes the top
function finishRecords() {
  const data = loadScores();
  data.bestCombo = Math.max(data.bestCombo, maxCombo);
  data.bestLines = Math.max(data.bestLines, lines);
  saveScores(data);
  renderScores(overlayRecords, -1);
  overlayRecords.classList.remove('hidden');
  if (qualifiesForTop(data, score)) {
    playerNameInput.value = '';
    nameRow.classList.remove('hidden');
    playerNameInput.focus();
  } else {
    nameRow.classList.add('hidden');
  }
}

function submitName() {
  if (nameRow.classList.contains('hidden')) return;
  const data = loadScores();
  const name = playerNameInput.value.trim().slice(0, MAX_NAME_LEN) || 'Anónimo';
  const idx = insertScore(data, { name, score, lines, level, combo: maxCombo });
  saveScores(data);
  nameRow.classList.add('hidden');
  renderScores(overlayRecords, idx);
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records?')) return;
  try {
    localStorage.removeItem(SCORES_KEY);
  } catch (e) {
    // ignore
  }
  renderScores(startRecords, -1);
}

document.addEventListener('keydown', e => {
  if (!current) return; // game not started yet
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
playBtn.addEventListener('click', init);
resetRecordsBtn.addEventListener('click', resetRecords);
saveScoreBtn.addEventListener('click', submitName);
playerNameInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') submitName();
});
themeToggleBtn.addEventListener('click', toggleTheme);

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark', { redraw: false });
renderScores(startRecords, -1);
