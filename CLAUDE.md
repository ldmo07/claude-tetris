# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris (HTML5 Canvas). No `package.json`, no build, no tests, no linter. The README and UI text are in Spanish.

## Running

Open `index.html` directly, or serve the folder statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, loaded as a plain script, no modules).

`game.js` is built around module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …) declared once and reset in `init()`. Key points that span functions:

- **Board model**: `ROWS × COLS` matrix; `0` is empty, `1–8` is an index into both `COLORS` and `PIECES` (same index = same piece type, so a piece's cells store its own color index). Index 8 is the 3×3 "tuerca" (nut) with an empty center cell; `randomPiece` picks uniformly over `PIECES.length - 1` types.
- **Piece lifecycle**: `spawn()` promotes `next` → `current` and draws the preview; it calls `endGame()` if the new piece collides. `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Both `hardDrop`, `softDrop` and the `loop` gravity tick end in `lockPiece()`.
- **Game loop**: `requestAnimationFrame(loop)` accumulates `dropAccum` and drops one row when it reaches `dropInterval`. Pause/game-over stop the loop via `cancelAnimationFrame(animId)`; resuming or `init()` must reset `lastTime` to avoid a huge `dt`. `init()` is also the restart handler.
- **Rotation**: `rotateCW` + `tryRotate` with horizontal-only kicks `[0, -1, 1, -2, 2]`.
- **Scoring/speed**: `LINE_SCORES × level`; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)` (set in `clearLines`). Soft drop +1/row, hard drop +2/row.
- **Rendering**: `draw()` repaints everything each frame (grid, board, ghost at `globalAlpha 0.2`, current piece). `drawBlock` is shared by the main and next-piece canvases.

- **Theming**: colors live in CSS variables (`:root` = dark default, `:root[data-theme="light"]` = light). `applyTheme()` in `game.js` sets `data-theme`, updates the canvas-drawn colors (`gridColor`, `highlightColor`) and repaints with `draw()`/`drawNext()` since the loop is stopped when paused/game over. Not persisted between sessions.
- **Records** (`// ---- Récords ----` block at the end of `game.js`): there is no auto-start any more; `#start-screen` is shown on load and its "Jugar" button sets `started = true` and calls `init()` (the keydown handler ignores input until `started`, and while `#rec-name` has focus). `lockPiece` → `clearLines` calls `trackCombo(cleared)` (consecutive piece locks that clear lines); `endGame()` calls `finishRecords()`, which updates `stats` (`bestCombo`, `maxLines`, key `tetris.stats`), and shows the name form if the score enters the top 5. Records `{name, score, lines, level, date}` live in `localStorage` key `tetris.records`; all storage access is in try/catch. Names are rendered with `textContent` only. `init()` calls `resetRecordsRun()` to clear combo/pending state and hide the records block of the shared overlay.

- **Pause menu**: `P`/`Escape` call `togglePause()` → `openPauseMenu()`/`resumeGame()` (section `// ---- Menú de pausa ----` in `game.js`; DOM `#pause-menu`, separate from the game-over `#overlay`). While `paused`, the keydown handler routes to `handlePauseMenuKey` and no game key acts; keys pressed during the menu are tracked in `heldDuringPause` (cleared on keyup) and `inputBlockedUntil` adds a 250 ms cooldown after resuming, which also resets `lastTime`. `startLevel` (1–10, chosen in the menu) persists across `init()`: `level = startLevel` and `clearLines` uses `level = max(startLevel, floor(lines/10)+1)`. The Reiniciar button calls `init()`; `init()` also closes the menu.

Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `width`/`height` of `<canvas id="board">` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). The next-piece canvas is a fixed 120×120 (4×4 cells of 30px, hardcoded `NB` in `drawNext`).
