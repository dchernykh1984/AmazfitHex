import { describe, it, expect, afterEach, vi } from "vitest";
import { LABELS } from "../lib/i18n/labels.js";
import { MODE_KEY, MODE_TWO_PLAYERS, SIZE_KEY, LEVEL_KEY } from "../lib/settings.js";
import { hexLayout } from "../lib/layout/hex-layout.js";
import {
  COLOR_BLUE,
  COLOR_CELL,
  COLOR_CELL_BLUE_EDGE,
  COLOR_CELL_BOTH_EDGES,
  COLOR_CELL_RED_EDGE,
  COLOR_MARK,
  COLOR_RED,
} from "../utils/config/constants.js";

const EN = LABELS.en;

// The doubles the page is currently wired to. Every load resets the module
// registry, which hands the page a fresh copy of each of them, so the tests take
// their copy from the same load rather than importing one up front.
let ui;
let storage;
let display;

// Build the page the way Zepp OS would: the module hands its definition to the
// global Page(), and the runtime then calls build() on it.
async function loadPage(options) {
  const config = options || {};
  vi.resetModules();
  ui = await import("./doubles/zos-ui.js");
  storage = await import("./doubles/zos-storage.js");
  display = await import("./doubles/zos-display.js");
  const settings = await import("./doubles/zos-settings.js");

  if (config.stored) {
    storage.seed(config.stored);
  }
  if (config.language) {
    settings.setLanguage(config.language);
  }
  if (config.brokenStorage) {
    storage.breakStorage();
  }

  let page = null;
  globalThis.Page = (definition) => {
    page = definition;
  };
  await import("../page/index.js");
  page.build();
  return page;
}

const widgetsOfType = (type) => ui.screen.widgets.filter((w) => w.type === type);
const texts = () => widgetsOfType(ui.widget.TEXT).map((w) => w.properties.text);
const canvas = () => widgetsOfType(ui.widget.CANVAS)[0];

function button(text) {
  const found = widgetsOfType(ui.widget.BUTTON).filter((w) => w.properties.text === text);
  expect(found.length, `expected exactly one "${text}" button, saw ${found.length}`).toBe(1);
  return found[0];
}

function hasButton(text) {
  return widgetsOfType(ui.widget.BUTTON).some((w) => w.properties.text === text);
}

// The board, as the tests need to see it: where each cell is, what colour it
// came out, and how to tap it. There are no per-cell widgets any more - one
// canvas holds the whole board - so a cell is addressed by the point at its
// centre, exactly as a finger addresses it.
function board(size) {
  const layout = hexLayout(466, size, 8, 96);
  const target = canvas();
  expect(target, "no board canvas on screen").toBeTruthy();
  // Far enough from the centre to miss the last-move dot, well inside the
  // hexagon: this is the cell's own colour rather than what is marked on it.
  const offset = Math.round(layout.radius * 0.55);
  return {
    layout,
    count: layout.cellCount,
    widget: target,
    tap: (cell) => target.tapAt(layout.centersX[cell], layout.centersY[cell]),
    tapAt: (x, y) => target.tapAt(x, y),
    colorOf: (cell) => target.colorAt(layout.centersX[cell] + offset, layout.centersY[cell]),
    markOf: (cell) => target.colorAt(layout.centersX[cell], layout.centersY[cell]),
  };
}

const at = (size, column, row) => row * size + column;

// Start a game of the given size in the given mode, from a fresh page. Two
// players on a five-cell board unless the test says otherwise.
async function startGame(options) {
  const config = options || {};
  const page = await loadPage({
    stored: {
      [MODE_KEY]: config.mode === undefined ? MODE_TWO_PLAYERS : config.mode,
      [SIZE_KEY]: config.sizeIndex === undefined ? 0 : config.sizeIndex,
      [LEVEL_KEY]: config.level === undefined ? 1 : config.level,
    },
  });
  button(EN.play).tap();
  return page;
}

// Red walks down column 2 while blue answers along column 4; the last red stone
// is left unplayed, so the caller decides when the game ends.
function playUpToRedsWin(view, size) {
  for (let row = 0; row < size - 1; row++) {
    view.tap(at(size, 2, row));
    view.tap(at(size, 4, row));
  }
}

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.Page;
});

describe("the menu", () => {
  it("opens on the menu with everything a game needs choosing", async () => {
    await loadPage();
    expect(texts()).toContain(EN.title);
    expect(texts()).toContain(EN.hint);
    expect(hasButton(EN.play)).toBe(true);
    expect(hasButton(EN.mode_cpu)).toBe(true);
    expect(hasButton(EN.level_normal)).toBe(true);
    expect(hasButton("7x7")).toBe(true);
  });

  it("draws no board canvas while the menu is up", async () => {
    // A canvas left listening under the menu would swallow every tap meant for
    // the buttons drawn on top of it.
    await loadPage();
    expect(canvas()).toBeUndefined();
  });

  it("hides the difficulty when there is no computer to set it for", async () => {
    await loadPage();
    button(EN.mode_cpu).tap();
    expect(hasButton(EN.mode_two)).toBe(true);
    expect(hasButton(EN.level_normal)).toBe(false);
    expect(hasButton(EN.play)).toBe(true);
  });

  it("cycles the board size and the difficulty", async () => {
    await loadPage();
    button("7x7").tap();
    expect(hasButton("9x9")).toBe(true);
    button("9x9").tap();
    expect(hasButton("5x5")).toBe(true);

    button(EN.level_normal).tap();
    expect(hasButton(EN.level_hard)).toBe(true);
  });

  it("remembers every choice for the next time the app opens", async () => {
    await loadPage();
    button(EN.mode_cpu).tap();
    button("7x7").tap();
    const kept = storage.stored();
    expect(kept[MODE_KEY]).toBe(MODE_TWO_PLAYERS);
    expect(kept[SIZE_KEY]).toBe(2);

    await loadPage({ stored: kept });
    expect(hasButton(EN.mode_two)).toBe(true);
    expect(hasButton("9x9")).toBe(true);
  });

  it("speaks the language the watch is set to", async () => {
    await loadPage({ language: 4 });
    expect(texts()).toContain(LABELS.ru.title);
    expect(hasButton(LABELS.ru.play)).toBe(true);
  });

  it("still plays on a watch whose storage refuses to work", async () => {
    const page = await loadPage({ brokenStorage: true });
    button("7x7").tap();
    expect(hasButton("9x9")).toBe(true);
    expect(page.state.destroyed).toBe(false);
  });

  it("keeps the screen lit while it is open and hands the setting back", async () => {
    const page = await loadPage();
    expect(display.display().brightTime).toBeGreaterThan(0);
    page.onDestroy();
    expect(display.display().reset).toBe(1);
  });

  it("plays again after the page has been left and built a second time", async () => {
    // Zepp OS can build a second page from the same module-level definition, so
    // a visit that ended must not leave anything behind that stops the next one
    // from working.
    const page = await loadPage({ stored: { [MODE_KEY]: MODE_TWO_PLAYERS, [SIZE_KEY]: 0 } });
    button(EN.play).tap();
    page.onDestroy();

    ui.reset();
    page.build();
    button(EN.play).tap();
    const view = board(5);
    view.tap(at(5, 2, 2));
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });
});

describe("a game between two players", () => {
  it("draws every cell of the board and says whose turn it is", async () => {
    await startGame();
    const view = board(5);
    expect(view.count).toBe(25);
    for (let cell = 0; cell < view.count; cell++) {
      expect(view.colorOf(cell), `cell ${cell} was never painted`).not.toBe(null);
    }
    expect(texts()).toContain(EN.turn_red);
    expect(hasButton(EN.menu)).toBe(true);
  });

  it("draws the board on one canvas rather than a widget per cell", async () => {
    await startGame({ sizeIndex: 2 });
    expect(widgetsOfType(ui.widget.CANVAS).length).toBe(1);
    // Only the page background is a rectangle widget; the 81 cells are drawn.
    expect(widgetsOfType(ui.widget.FILL_RECT).length).toBe(1);
  });

  it("keeps the footer buttons clear of the canvas, or they would be dead", async () => {
    await startGame();
    const view = board(5);
    const menu = button(EN.menu);
    expect(view.widget.properties.h).toBe(view.layout.bottom);
    expect(menu.properties.y).toBeGreaterThanOrEqual(view.widget.properties.h);
  });

  it("puts a stone down where it is tapped and passes the turn", async () => {
    await startGame();
    const view = board(5);
    view.tap(at(5, 2, 2));
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);

    // The pie rule is on offer now, so blue answers by tapping rather than by
    // taking the stone.
    view.tap(at(5, 0, 0));
    expect(view.colorOf(at(5, 0, 0))).toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.turn_red);
  });

  it("takes a tap anywhere inside a cell, not just dead centre", async () => {
    await startGame();
    const view = board(5);
    const cell = at(5, 2, 2);
    view.tapAt(view.layout.centersX[cell], view.layout.centersY[cell] - view.layout.radius * 0.7);
    expect(view.colorOf(cell)).toBe(COLOR_RED);
  });

  it("ignores a tap that missed the board", async () => {
    await startGame();
    const view = board(5);
    view.tapAt(5, 5);
    expect(texts()).toContain(EN.turn_red);
  });

  it("ignores a tap on a cell that already has a stone on it", async () => {
    await startGame();
    const view = board(5);
    view.tap(at(5, 2, 2));
    view.tap(at(5, 2, 2));
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });

  it("offers the pie rule once, to the second player only", async () => {
    await startGame();
    const view = board(5);
    expect(hasButton(EN.swap)).toBe(false);

    view.tap(at(5, 2, 2));
    expect(hasButton(EN.swap)).toBe(true);

    button(EN.swap).tap();
    // The opening stone changed hands, so it is the opener who now moves - and
    // plays blue.
    expect(hasButton(EN.swap)).toBe(false);
    expect(texts()).toContain(EN.turn_blue);
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_RED);
  });

  it("drops the pie rule as soon as the second player answers with a stone", async () => {
    await startGame();
    const view = board(5);
    view.tap(at(5, 2, 2));
    view.tap(at(5, 0, 0));
    expect(hasButton(EN.swap)).toBe(false);
  });

  it("announces the winner, leaves the board up and offers another game", async () => {
    await startGame();
    const view = board(5);
    playUpToRedsWin(view, 5);
    expect(texts()).toContain(EN.turn_red);

    view.tap(at(5, 2, 4));
    expect(texts()).toContain(EN.win_red);
    expect(hasButton(EN.again)).toBe(true);
    expect(hasButton(EN.menu)).toBe(true);
    expect(view.colorOf(at(5, 2, 4))).toBe(COLOR_RED);
  });

  it("stops taking moves once the game is won", async () => {
    await startGame();
    const view = board(5);
    playUpToRedsWin(view, 5);
    view.tap(at(5, 2, 4));

    view.tap(at(5, 1, 1));
    expect(view.colorOf(at(5, 1, 1))).not.toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.win_red);
  });

  it("deals another hand on the canvas already up rather than making a new one", async () => {
    await startGame();
    const view = board(5);
    playUpToRedsWin(view, 5);
    view.tap(at(5, 2, 4));

    button(EN.again).tap();
    const again = board(5);
    // The same canvas, wiped and repainted: a new board costs no widget churn on
    // a watch that can ill afford it.
    expect(again.widget).toBe(view.widget);
    for (let cell = 0; cell < again.count; cell++) {
      expect(again.colorOf(cell)).not.toBe(COLOR_RED);
      expect(again.colorOf(cell)).not.toBe(COLOR_BLUE);
    }
    expect(texts()).toContain(EN.turn_red);

    // And it still plays.
    again.tap(at(5, 1, 1));
    expect(again.colorOf(at(5, 1, 1))).toBe(COLOR_RED);
  });

  it("redraws the board when the size chosen in the menu changed", async () => {
    await startGame();
    const view = board(5);
    button(EN.menu).tap();
    expect(view.widget.deleted).toBe(true);

    button("5x5").tap();
    button(EN.play).tap();
    const bigger = board(7);
    expect(bigger.count).toBe(49);
    expect(bigger.widget).not.toBe(view.widget);
    for (let cell = 0; cell < bigger.count; cell++) {
      expect(bigger.colorOf(cell), `cell ${cell} was never painted`).not.toBe(null);
    }
  });

  it("goes back to the menu, and to a board of the size chosen there", async () => {
    await startGame();
    button(EN.menu).tap();
    expect(hasButton(EN.play)).toBe(true);
    // Only the page background is left drawn, and the canvas is gone.
    expect(widgetsOfType(ui.widget.FILL_RECT).length).toBe(1);
    expect(canvas()).toBeUndefined();

    button("5x5").tap();
    button(EN.play).tap();
    expect(board(7).count).toBe(49);
  });
});

describe("a game against the watch", () => {
  it("answers on its own once the player has moved", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const view = board(5);
    expect(texts()).toContain(EN.turn_you);

    view.tap(at(5, 0, 0));
    // A corner opening is not worth taking over, so the watch answers with a
    // stone of its own rather than with the pie rule.
    expect(texts()).toContain(EN.thinking);
    vi.runOnlyPendingTimers();

    let blue = 0;
    for (let cell = 0; cell < view.count; cell++) {
      if (view.colorOf(cell) === COLOR_BLUE) {
        blue++;
      }
    }
    expect(blue).toBe(1);
    expect(texts()).toContain(EN.turn_you);
  });

  it("takes the opening stone when it is worth taking", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const view = board(5);
    view.tap(at(5, 2, 2));
    vi.runOnlyPendingTimers();

    // Having taken red, the watch leaves the player on blue and to move.
    for (let cell = 0; cell < view.count; cell++) {
      expect(view.colorOf(cell)).not.toBe(COLOR_BLUE);
    }
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_you);
  });

  it("never offers the player the pie rule, because the watch decides it", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const view = board(5);
    view.tap(at(5, 0, 0));
    expect(hasButton(EN.swap)).toBe(false);
    vi.runOnlyPendingTimers();
    expect(hasButton(EN.swap)).toBe(false);
  });

  it("refuses taps while it is thinking", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const view = board(5);
    view.tap(at(5, 0, 0));
    expect(texts()).toContain(EN.thinking);

    view.tap(at(5, 4, 4));
    expect(view.colorOf(at(5, 4, 4))).not.toBe(COLOR_RED);
    vi.runOnlyPendingTimers();
    expect(view.colorOf(at(5, 4, 4))).not.toBe(COLOR_RED);
  });

  it("does not answer into a page that has been left", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const view = board(5);
    view.tap(at(5, 0, 0));
    button(EN.menu).tap();
    vi.runOnlyPendingTimers();
    expect(hasButton(EN.play)).toBe(true);
    expect(page.state.game).toBe(null);
  });

  it("gives up rather than asking itself again when there is nothing to play", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const view = board(5);
    view.tap(at(5, 0, 0));

    // A board with no empty cell and no winner cannot arise from the rules; it
    // is forced here because what it must not do - ask for an answer that
    // changes nothing, over and over - would run until the battery died.
    page.state.game.cells.fill(1);
    vi.runOnlyPendingTimers();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("plays a whole game out and names the winner as the player or the watch", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 0 });
    const view = board(5);
    // The player fills the first free cell it finds and the watch answers, so
    // between them the board runs out - and a full Hex board always has a
    // winner, whichever of the two it turns out to be.
    for (let move = 0; move < 25 && !hasButton(EN.again); move++) {
      const free = page.state.game.cells.findIndex((stone) => stone === 0);
      expect(free, "the board filled up without anybody winning").toBeGreaterThanOrEqual(0);
      view.tap(free);
      vi.runOnlyPendingTimers();
    }
    expect(hasButton(EN.again)).toBe(true);
    const shown = texts();
    expect(shown.includes(EN.win_you) || shown.includes(EN.win_cpu)).toBe(true);
  });
});

describe("the edges of the board", () => {
  it("tints each player's two sides, and the corners as belonging to both", async () => {
    await startGame();
    const view = board(5);

    // Red joins the top and bottom rows, blue the left and right columns.
    expect(view.colorOf(at(5, 2, 0))).toBe(COLOR_CELL_RED_EDGE);
    expect(view.colorOf(at(5, 2, 4))).toBe(COLOR_CELL_RED_EDGE);
    expect(view.colorOf(at(5, 0, 2))).toBe(COLOR_CELL_BLUE_EDGE);
    expect(view.colorOf(at(5, 4, 2))).toBe(COLOR_CELL_BLUE_EDGE);

    // Every corner carries one edge of each player, which is how Hex counts
    // them, so none of them is painted as one player's alone.
    for (const corner of [
      [0, 0],
      [4, 0],
      [0, 4],
      [4, 4],
    ]) {
      expect(view.colorOf(at(5, corner[0], corner[1])), `${corner}`).toBe(COLOR_CELL_BOTH_EDGES);
    }

    // Everything else is a plain cell.
    expect(view.colorOf(at(5, 2, 2))).toBe(COLOR_CELL);
    expect(view.colorOf(at(5, 1, 3))).toBe(COLOR_CELL);
  });

  it("paints a cell back to its own tint when the board is dealt again", async () => {
    await startGame();
    const view = board(5);
    playUpToRedsWin(view, 5);
    view.tap(at(5, 2, 4));

    button(EN.again).tap();
    expect(view.colorOf(at(5, 2, 0))).toBe(COLOR_CELL_RED_EDGE);
    expect(view.colorOf(at(5, 2, 4))).toBe(COLOR_CELL_RED_EDGE);
    expect(view.colorOf(at(5, 4, 2))).toBe(COLOR_CELL_BLUE_EDGE);
    expect(view.colorOf(at(5, 0, 0))).toBe(COLOR_CELL_BOTH_EDGES);
  });
});

describe("the last-move mark", () => {
  it("follows the stone that was played last, leaving none behind", async () => {
    await startGame();
    const view = board(5);
    const first = at(5, 2, 2);
    const second = at(5, 0, 0);

    view.tap(first);
    expect(view.markOf(first)).toBe(COLOR_MARK);

    view.tap(second);
    expect(view.markOf(second)).toBe(COLOR_MARK);
    // The dot is not a widget that moves: the cell it was on is painted over,
    // so what shows there now is the stone itself.
    expect(view.markOf(first)).toBe(COLOR_RED);
  });

  it("is gone from a board that has been dealt again", async () => {
    await startGame();
    const view = board(5);
    const cell = at(5, 2, 2);
    view.tap(cell);
    expect(view.markOf(cell)).toBe(COLOR_MARK);

    button(EN.menu).tap();
    button(EN.play).tap();
    const fresh = board(5);
    expect(fresh.markOf(cell)).not.toBe(COLOR_MARK);
  });
});

describe("the board canvas", () => {
  it("replaces a canvas left at the wrong height for the board being drawn", async () => {
    // A canvas is sized when it is created, so one kept from a smaller board
    // would be too short to draw the last row of a bigger one - and deaf to taps
    // on it. Reached here by starting a game straight onto a changed layout,
    // which is what any new caller of startGame would do.
    const page = await startGame();
    const small = board(5);
    const shortCanvas = small.widget;

    page.state.sizeIndex = 2;
    page.startGame();

    const big = board(9);
    expect(big.count).toBe(81);
    expect(big.widget).not.toBe(shortCanvas);
    expect(shortCanvas.deleted).toBe(true);
    expect(big.widget.properties.h).toBe(big.layout.bottom);
    // The bottom row is drawn and takes a tap.
    const last = big.count - 1;
    expect(big.colorOf(last)).not.toBe(null);
    big.tap(last);
    expect(big.colorOf(last)).toBe(COLOR_RED);
  });
});
