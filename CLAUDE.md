# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris (HTML5 Canvas). No `package.json`, no build, no tests, no linter. The README and UI text are in Spanish.

## Running

Open `index.html` directly, or serve the folder statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, loaded as a plain script, no modules).

`game.js` is built around module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …) declared once and reset in `init()`. Key points that span functions:

- **Board model**: `ROWS × COLS` matrix; `0` is empty, `1–7` is an index into both `COLORS` and `PIECES` (same index = same piece type, so a piece's cells store its own color index).
- **Piece lifecycle**: `spawn()` promotes `next` → `current` and draws the preview; it calls `endGame()` if the new piece collides. `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Both `hardDrop`, `softDrop` and the `loop` gravity tick end in `lockPiece()`.
- **Game loop**: `requestAnimationFrame(loop)` accumulates `dropAccum` and drops one row when it reaches `dropInterval`. Pause/game-over stop the loop via `cancelAnimationFrame(animId)`; resuming or `init()` must reset `lastTime` to avoid a huge `dt`. `init()` is also the restart handler.
- **Rotation**: `rotateCW` + `tryRotate` with horizontal-only kicks `[0, -1, 1, -2, 2]`.
- **Scoring/speed**: `LINE_SCORES × level`; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)` (set in `clearLines`). Soft drop +1/row, hard drop +2/row.
- **Rendering**: `draw()` repaints everything each frame (grid, board, ghost at `globalAlpha 0.2`, current piece). `drawBlock` is shared by the main and next-piece canvases.

Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `width`/`height` of `<canvas id="board">` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). The next-piece canvas is a fixed 120×120 (4×4 cells of 30px, hardcoded `NB` in `drawNext`).
