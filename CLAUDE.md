# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

No build, no dependencies, no tests, no lint. There is no `package.json` and no test
command — don't go looking for one.

```bash
start index.html          # Windows: open directly (works — no modules, no fetches)
python -m http.server 8000   # or: npx serve .
```

Verification is manual in the browser. There is no headless harness.

## Architecture

Three files: [index.html](index.html) (DOM + two canvases), [style.css](style.css),
[game.js](game.js) (all logic).

**Module-scope mutable globals.** [game.js:43](game.js#L43) declares all game state as
bare `let`: `board, current, next, score, lines, level, paused, gameOver, lastTime,
dropAccum, dropInterval, animId`. Functions read and mutate these directly rather than
taking state as parameters. Match that style — don't introduce a class or state object
for a single feature.

**Piece type == color index.** [PIECES\[n\]](game.js#L18) has its cells filled with the
literal `n`, and [COLORS\[n\]](game.js#L7) is that piece's color. The board stores the
same integer. So `board[r][c]` means "occupied", "which piece", and "which color" all at
once. Adding a piece means appending to *both* arrays at the same index.

**Canvas size is duplicated in HTML.** `<canvas id="board">` is `300x600` at
[index.html:12](index.html#L12) — that must equal `COLS * BLOCK` by `ROWS * BLOCK`.
`<canvas id="next-canvas">` is `120x120` at [index.html:30](index.html#L30), assuming a
4x4 preview grid at the local `NB = 30` inside [drawNext()](game.js#L211) — `NB` is
separate from the board's `BLOCK`. Changing `COLS`/`ROWS`/`BLOCK` requires editing
`index.html` too.

**Full redraw every frame.** [loop()](game.js#L243) accumulates `dt` into `dropAccum`,
drops one row past `dropInterval`, then [draw()](game.js#L188) repaints grid + board +
ghost + current piece from scratch. No dirty rects, no diffing — new visuals just get
drawn in `draw()`.

**HUD updates are manual.** `updateHUD()` is *not* called from the loop. It fires from
the [keydown handler](game.js#L299), `clearLines()`, `softDrop()`, and `init()`. Any new
code path that changes `score`/`lines`/`level` must call it or the display silently goes
stale.

**Lifecycle.** [init()](game.js#L259) is the single reset path and is bound to the
restart button; it re-initializes every global and restarts the rAF loop.
[togglePause()](game.js#L229) cancels the frame and, on resume, resets `lastTime` before
restarting `loop` — skipping that reset yields a huge `dt` and an instant multi-row drop.
`endGame()` cancels the frame. Game over is detected *only* by a spawn-time collision in
[spawn()](game.js#L144); there is no lock-out rule.

**Rotation is not SRS.** `rotateCW()` is a plain transpose + row-reverse, and
[tryRotate()](game.js#L77) tries horizontal kicks `[0, -1, 1, -2, 2]` only — no wall-kick
tables, no per-piece offsets, no floor kicks.

## Conventions

- Identifiers and code comments are English; **all user-facing UI text is Spanish**
  (control list in `index.html`, `PAUSA`, `GAME OVER`, `Puntuación:`, `Reiniciar`). Keep
  new UI text Spanish.
- `game.js` is `'use strict'` plain ES6+ loaded via a classic `<script src>`, not a
  module — `import`/`export` will break it.
- `style.css` uses hardcoded hex colors throughout; there are no CSS custom properties,
  despite what `README.md` claims.

[README.md](README.md) (Spanish) covers gameplay, controls, scoring formulas, and a
customization table — read it rather than re-deriving those.
