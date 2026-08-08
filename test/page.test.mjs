import { describe, it, expect, afterEach, vi } from "vitest";
import { LABELS } from "../lib/i18n/labels.js";
import {
  MODE_KEY,
  MODE_TWO_PLAYERS,
  SIZE_KEY,
  LEVEL_KEY,
  SWAP_KEY,
  SWAP_OFF,
} from "../lib/settings.js";
import {
  cellCenterX,
  cellCenterY,
  hexLayout,
  isCellFullyVisible,
  panLimits,
} from "../lib/layout/hex-layout.js";
import {
  COLOR_BLUE,
  COLOR_CELL,
  COLOR_CELL_BLUE_EDGE,
  COLOR_CELL_BOTH_EDGES,
  COLOR_CELL_RED_EDGE,
  COLOR_MARK,
  COLOR_RED,
  DRAG_REPAINT_STEP,
  DRAG_SLOP,
  MIN_CAP,
  SCREEN_PADDING,
} from "../utils/config/constants.js";

const EN = LABELS.en;
const SCREEN = 466;
const VIEW = { w: SCREEN, h: SCREEN - 2 * MIN_CAP };
const MIDDLE_X = Math.round(VIEW.w / 2);
const MIDDLE_Y = Math.round(VIEW.h / 2);

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

function button(text) {
  const found = widgetsOfType(ui.widget.BUTTON).filter((w) => w.properties.text === text);
  expect(found.length, `expected exactly one "${text}" button, saw ${found.length}`).toBe(1);
  return found[0];
}

function hasButton(text) {
  return widgetsOfType(ui.widget.BUTTON).some((w) => w.properties.text === text);
}

function canvas() {
  const found = widgetsOfType(ui.widget.CANVAS);
  expect(found.length, "expected exactly one board canvas").toBe(1);
  return found[0];
}

// The hexagons drawn in the most recent frame, by the cell they belong to.
function drawnCells(layout, page) {
  const originX = MIDDLE_X + page.state.panX;
  const originY = MIDDLE_Y + page.state.panY;
  const byCell = new Map();
  for (const draw of canvas().frame()) {
    if (draw.op !== "drawPoly") {
      continue;
    }
    // The middle of a hexagon is the average of its corners.
    const x = Math.round(draw.points.reduce((sum, p) => sum + p.x, 0) / draw.points.length);
    const y = Math.round(draw.points.reduce((sum, p) => sum + p.y, 0) / draw.points.length);
    for (let cell = 0; cell < layout.cellCount; cell++) {
      if (
        Math.abs(cellCenterX(layout, cell, originX) - x) <= 1 &&
        Math.abs(cellCenterY(layout, cell, originY) - y) <= 1
      ) {
        byCell.set(cell, draw);
        break;
      }
    }
  }
  return byCell;
}

const at = (size, column, row) => row * size + column;

// The screen point the middle of a cell is currently at. The board is drawn in
// the canvas's own coordinates and the canvas sits below the status cap, so a
// touch reported by the watch carries that offset - and the slide of a drag in
// progress on top of it.
function pointOf(layout, page, cell) {
  return {
    x: cellCenterX(layout, cell, MIDDLE_X + page.state.panX),
    y: cellCenterY(layout, cell, MIDDLE_Y + page.state.panY) + MIN_CAP,
  };
}

function tap(page, layout, cell) {
  const point = pointOf(layout, page, cell);
  canvas().fire(ui.event.CLICK_DOWN, point);
  canvas().fire(ui.event.CLICK_UP, point);
}

function drag(page, from, dx, dy) {
  canvas().fire(ui.event.CLICK_DOWN, from);
  canvas().fire(ui.event.MOVE, { x: from.x + dx, y: from.y + dy });
  canvas().fire(ui.event.CLICK_UP, { x: from.x + dx, y: from.y + dy });
}

// Start a game of the given size in the given mode, from a fresh page. Two
// players on a five-cell board unless the test says otherwise.
async function startGame(options) {
  const config = options || {};
  const page = await loadPage({
    stored: {
      [MODE_KEY]: config.mode === undefined ? MODE_TWO_PLAYERS : config.mode,
      [SIZE_KEY]: config.sizeIndex === undefined ? 0 : config.sizeIndex,
      [LEVEL_KEY]: config.level === undefined ? 1 : config.level,
      [SWAP_KEY]: config.swap === undefined ? 1 : config.swap,
    },
  });
  button(EN.play).tap();
  return page;
}

// Red walks down column 2 while blue answers along column 4; the last red stone
// is left unplayed, so the caller decides when the game ends.
function playUpToRedsWin(page, layout, size) {
  for (let row = 0; row < size - 1; row++) {
    tap(page, layout, at(size, 2, row));
    tap(page, layout, at(size, 4, row));
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

  it("offers the pie rule as a setting and remembers it", async () => {
    await loadPage();
    expect(hasButton(EN.swap_on)).toBe(true);

    button(EN.swap_on).tap();
    expect(hasButton(EN.swap_off)).toBe(true);
    expect(storage.stored()[SWAP_KEY]).toBe(SWAP_OFF);

    await loadPage({ stored: storage.stored() });
    expect(hasButton(EN.swap_off)).toBe(true);
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
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    expect(drawnCells(layout, page).get(at(5, 2, 2)).color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });
});

describe("the board", () => {
  it("is one canvas of hexagons, not a widget per cell", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    expect(widgetsOfType(ui.widget.CANVAS).length).toBe(1);
    const drawn = drawnCells(layout, page);
    expect(drawn.size).toBe(25);
    for (const draw of drawn.values()) {
      expect(draw.points.length).toBe(6);
    }
  });

  it("clears the canvas before each frame rather than drawing over the last one", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    const ops = canvas().draws.map((draw) => draw.op);
    expect(ops).toContain("clear");
    // Everything after the final clear is one whole frame.
    expect(
      canvas()
        .frame()
        .filter((draw) => draw.op === "clear").length
    ).toBe(0);
  });

  it("tints each player's two sides, and the corners as belonging to both", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    const drawn = drawnCells(layout, page);

    expect(drawn.get(at(5, 2, 0)).color).toBe(COLOR_CELL_RED_EDGE);
    expect(drawn.get(at(5, 2, 4)).color).toBe(COLOR_CELL_RED_EDGE);
    expect(drawn.get(at(5, 0, 2)).color).toBe(COLOR_CELL_BLUE_EDGE);
    expect(drawn.get(at(5, 4, 2)).color).toBe(COLOR_CELL_BLUE_EDGE);

    for (const corner of [
      [0, 0],
      [4, 0],
      [0, 4],
      [4, 4],
    ]) {
      expect(drawn.get(at(5, corner[0], corner[1])).color, `${corner}`).toBe(COLOR_CELL_BOTH_EDGES);
    }

    expect(drawn.get(at(5, 2, 2)).color).toBe(COLOR_CELL);
    expect(drawn.get(at(5, 1, 3)).color).toBe(COLOR_CELL);
  });

  it("marks the stone played last and moves the mark with the play", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));

    const marks = canvas()
      .frame()
      .filter((draw) => draw.op === "drawCircle" && draw.color === COLOR_MARK);
    expect(marks.length).toBe(1);
    expect(marks[0].x).toBe(pointOf(layout, page, at(5, 2, 2)).x);

    tap(page, layout, at(5, 0, 0));
    const moved = canvas()
      .frame()
      .filter((draw) => draw.op === "drawCircle" && draw.color === COLOR_MARK);
    expect(moved.length).toBe(1);
    expect(moved[0].x).toBe(pointOf(layout, page, at(5, 0, 0)).x);
  });

  it("stops painting the hexagons dragged right off the far side", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    expect(drawnCells(layout, page).size).toBeGreaterThan(0);
    expect(drawnCells(layout, page).size).toBeLessThan(layout.cellCount);

    // Dragged hard into one corner, a different set of them is on screen.
    const before = [...drawnCells(layout, page).keys()].join();
    drag(page, { x: 233, y: MIN_CAP + 137 }, 5000, 5000);
    expect([...drawnCells(layout, page).keys()].join()).not.toBe(before);
  });

  it("goes away when the game does, leaving the menu unobstructed", async () => {
    await startGame();
    button(EN.menu).tap();
    expect(widgetsOfType(ui.widget.CANVAS).length).toBe(0);
    expect(hasButton(EN.play)).toBe(true);
  });
});

describe("dragging the board", () => {
  it("holds a board that already fits perfectly still", async () => {
    const page = await startGame({ sizeIndex: 0 });
    expect(page.state.panLimit).toEqual({ x: 0, y: 0 });
    drag(page, { x: 233, y: 137 }, 90, 60);
    expect(page.state.panX).toBe(0);
    expect(page.state.panY).toBe(0);
  });

  it("moves a bigger board under the finger", async () => {
    const page = await startGame({ sizeIndex: 2 });
    canvas().fire(ui.event.CLICK_DOWN, { x: 233, y: MIN_CAP + 137 });
    canvas().fire(ui.event.MOVE, { x: 233 - 40, y: MIN_CAP + 137 - 30 });
    expect(page.state.panX).toBe(-40);
    expect(page.state.panY).toBe(-30);
    canvas().fire(ui.event.CLICK_UP, { x: 233 - 40, y: MIN_CAP + 137 - 30 });
    expect(page.state.panX).toBe(-40);
  });

  it("does not repaint for every twitch of the finger", async () => {
    // Repainting a board of hexagons costs over a tenth of a second, so the
    // board has to have gone somewhere before the picture is redrawn.
    const page = await startGame({ sizeIndex: 2 });
    canvas().fire(ui.event.CLICK_DOWN, { x: 233, y: MIN_CAP + 137 });
    const before = canvas().draws.filter((draw) => draw.op === "clear").length;

    for (let step = 1; step <= 4; step += 1) {
      canvas().fire(ui.event.MOVE, { x: 233 - DRAG_SLOP - step, y: MIN_CAP + 137 });
    }
    const during = canvas().draws.filter((draw) => draw.op === "clear").length;
    expect(during - before).toBeLessThan(4);

    canvas().fire(ui.event.MOVE, { x: 233 - DRAG_REPAINT_STEP * 4, y: MIN_CAP + 137 });
    expect(canvas().draws.filter((draw) => draw.op === "clear").length).toBeGreaterThan(during);
    canvas().fire(ui.event.CLICK_UP, { x: 233 - DRAG_REPAINT_STEP * 4, y: MIN_CAP + 137 });
    expect(page.state.panX).toBe(-DRAG_REPAINT_STEP * 4);
  });

  it("never drags the board off its own edge", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    const limits = panLimits(layout, SCREEN, SCREEN_PADDING);
    drag(page, { x: 233, y: 137 }, 5000, 5000);
    expect(page.state.panX).toBe(limits.x);
    expect(page.state.panY).toBe(limits.y);
  });

  it("brings different cells on screen once the drag is done", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    const before = drawnCells(layout, page);
    drag(page, { x: 233, y: 137 }, 100, 0);
    const after = drawnCells(layout, page);
    expect([...after.keys()].join()).not.toBe([...before.keys()].join());
  });

  it("puts the stone under the finger even when the board has been dragged", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    drag(page, { x: 233, y: 137 }, 80, 40);

    const cell = at(9, 4, 4);
    tap(page, layout, cell);
    expect(drawnCells(layout, page).get(cell).color).toBe(COLOR_RED);
  });

  it("ignores a wobble too small to be a drag, so it still counts as a tap", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    const cell = at(9, 4, 4);
    const point = pointOf(layout, page, cell);
    canvas().fire(ui.event.CLICK_DOWN, point);
    canvas().fire(ui.event.MOVE, { x: point.x + DRAG_SLOP - 1, y: point.y });
    canvas().fire(ui.event.CLICK_UP, { x: point.x + DRAG_SLOP - 1, y: point.y });

    expect(page.state.panX).toBe(0);
    expect(drawnCells(layout, page).get(cell).color).toBe(COLOR_RED);
  });

  it("does not place a stone at the end of a real drag", async () => {
    const page = await startGame({ sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    const cell = at(9, 4, 4);
    const point = pointOf(layout, page, cell);
    canvas().fire(ui.event.CLICK_DOWN, point);
    canvas().fire(ui.event.MOVE, { x: point.x + 60, y: point.y });
    canvas().fire(ui.event.CLICK_UP, { x: point.x + 60, y: point.y });

    expect(page.state.panX).toBe(60);
    for (const draw of drawnCells(layout, page).values()) {
      expect(draw.color).not.toBe(COLOR_RED);
    }
    expect(texts()).toContain(EN.turn_red);
  });

  it("settles the board when the finger leaves the canvas mid-drag", async () => {
    // No release event arrives in that case, so without this the page would
    // still think a finger was down and the next touch would carry on the old
    // drag from wherever it left off.
    const page = await startGame({ sizeIndex: 2 });
    canvas().fire(ui.event.CLICK_DOWN, { x: 233, y: MIN_CAP + 137 });
    canvas().fire(ui.event.MOVE, { x: 233 + 70, y: MIN_CAP + 137 });
    expect(page.state.panX).toBe(70);

    canvas().fire(ui.event.MOVE_OUT, {});
    expect(page.state.touching).toBe(false);
    expect(page.state.dragged).toBe(false);
    expect(page.state.panX).toBe(70);
    // What is drawn matches where the board actually is.
    expect(page.state.paintedPanX).toBe(70);
  });

  it("abandons a drag that the watch's own move panned out from under", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 0, sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);

    drag(page, { x: 233, y: MIN_CAP + 137 }, 5000, 5000);
    tap(page, layout, at(9, 0, 0));

    // A drag begun while the watch is thinking is measured against a pan the
    // watch is about to throw away.
    canvas().fire(ui.event.CLICK_DOWN, { x: 233, y: MIN_CAP + 137 });
    canvas().fire(ui.event.MOVE, { x: 233 - 50, y: MIN_CAP + 137 });
    vi.runOnlyPendingTimers();

    const settled = page.state.panX;
    expect(page.state.touching).toBe(false);
    canvas().fire(ui.event.MOVE, { x: 233 - 90, y: MIN_CAP + 137 });
    expect(page.state.panX).toBe(settled);
  });

  it("starts every game with the board centred", async () => {
    const page = await startGame({ sizeIndex: 2 });
    drag(page, { x: 233, y: 137 }, 120, 80);
    expect(page.state.panX).not.toBe(0);

    button(EN.menu).tap();
    button(EN.play).tap();
    expect(page.state.panX).toBe(0);
    expect(page.state.panY).toBe(0);
  });
});

describe("a game between two players", () => {
  it("says whose turn it is and offers a way back to the menu", async () => {
    await startGame();
    expect(texts()).toContain(EN.turn_red);
    expect(hasButton(EN.menu)).toBe(true);
  });

  it("puts a stone down where it is tapped and passes the turn", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    expect(drawnCells(layout, page).get(at(5, 2, 2)).color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);

    tap(page, layout, at(5, 0, 0));
    expect(drawnCells(layout, page).get(at(5, 0, 0)).color).toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.turn_red);
  });

  it("ignores a tap on a cell that already has a stone on it", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    tap(page, layout, at(5, 2, 2));
    expect(drawnCells(layout, page).get(at(5, 2, 2)).color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });

  it("ignores a tap that missed the board altogether", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    canvas().fire(ui.event.CLICK_DOWN, { x: 4, y: MIN_CAP + 4 });
    canvas().fire(ui.event.CLICK_UP, { x: 4, y: MIN_CAP + 4 });
    for (const draw of drawnCells(layout, page).values()) {
      expect(draw.color).not.toBe(COLOR_RED);
    }
    expect(texts()).toContain(EN.turn_red);
  });

  it("offers the pie rule once, to the second player only", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    expect(hasButton(EN.swap)).toBe(false);

    tap(page, layout, at(5, 2, 2));
    expect(hasButton(EN.swap)).toBe(true);

    button(EN.swap).tap();
    expect(hasButton(EN.swap)).toBe(false);
    // The stone stays put and keeps its colour; what changed is whose it is,
    // which is why the screen says so rather than showing the turn as usual.
    expect(texts()).toContain(EN.swapped);
    expect(drawnCells(layout, page).get(at(5, 2, 2)).color).toBe(COLOR_RED);
  });

  it("says so when a side swap happens, then goes back to whose turn it is", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    button(EN.swap).tap();

    // A swap changes nothing you can see on the board, so the screen has to say
    // it happened - and say it in the colour the player to move is now on.
    expect(texts()).toContain(EN.swapped);
    expect(texts()).not.toContain(EN.turn_blue);

    tap(page, layout, at(5, 0, 0));
    expect(texts()).not.toContain(EN.swapped);
    expect(texts()).toContain(EN.turn_red);
  });

  it("never offers the swap when the setting is off", async () => {
    const page = await startGame({ swap: SWAP_OFF });
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    expect(hasButton(EN.swap)).toBe(false);
    expect(texts()).toContain(EN.turn_blue);
  });

  it("drops the pie rule as soon as the second player answers with a stone", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 2, 2));
    tap(page, layout, at(5, 0, 0));
    expect(hasButton(EN.swap)).toBe(false);
  });

  it("announces the winner, leaves the board up and offers another game", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    playUpToRedsWin(page, layout, 5);
    expect(texts()).toContain(EN.turn_red);

    tap(page, layout, at(5, 2, 4));
    expect(texts()).toContain(EN.win_red);
    expect(hasButton(EN.again)).toBe(true);
    expect(hasButton(EN.menu)).toBe(true);
    expect(drawnCells(layout, page).get(at(5, 2, 4)).color).toBe(COLOR_RED);
  });

  it("stops taking moves once the game is won", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    playUpToRedsWin(page, layout, 5);
    tap(page, layout, at(5, 2, 4));

    tap(page, layout, at(5, 1, 1));
    expect(drawnCells(layout, page).get(at(5, 1, 1)).color).not.toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.win_red);
  });

  it("deals another hand on an empty board", async () => {
    const page = await startGame();
    const layout = hexLayout(SCREEN, 5);
    playUpToRedsWin(page, layout, 5);
    tap(page, layout, at(5, 2, 4));

    button(EN.again).tap();
    const drawn = drawnCells(layout, page);
    expect(drawn.size).toBe(25);
    for (const draw of drawn.values()) {
      expect(draw.color).not.toBe(COLOR_RED);
      expect(draw.color).not.toBe(COLOR_BLUE);
    }
    expect(texts()).toContain(EN.turn_red);

    tap(page, layout, at(5, 1, 1));
    expect(drawnCells(layout, page).get(at(5, 1, 1)).color).toBe(COLOR_RED);
  });

  it("goes back to the menu, and to a board of the size chosen there", async () => {
    const page = await startGame();
    button(EN.menu).tap();
    button("5x5").tap();
    button(EN.play).tap();
    const layout = hexLayout(SCREEN, 7);
    const drawn = drawnCells(layout, page);
    // A seven-cell board is wider than the screen, so its far corners are off
    // the edge and not painted until they are dragged in.
    expect(drawn.size).toBeGreaterThan(25);
    expect(drawn.size).toBeLessThanOrEqual(49);
    expect(page.state.layout.size).toBe(7);
  });
});

describe("a game against the watch", () => {
  it("answers on its own once the player has moved", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const layout = hexLayout(SCREEN, 5);
    expect(texts()).toContain(EN.turn_you);

    tap(page, layout, at(5, 0, 0));
    expect(texts()).toContain(EN.thinking);
    vi.runOnlyPendingTimers();

    const blue = [...drawnCells(layout, page).values()].filter((draw) => draw.color === COLOR_BLUE);
    expect(blue.length).toBe(1);
    expect(texts()).toContain(EN.turn_you);
  });

  it("says so when the watch takes the opening stone", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const layout = hexLayout(SCREEN, 5);

    tap(page, layout, at(5, 2, 2));
    vi.runOnlyPendingTimers();

    // The watch answered by taking the stone rather than by playing one, which
    // without a word on screen looks exactly like a move that went nowhere.
    expect(page.state.swapped).toBe(true);
    expect(texts()).toContain(EN.swapped);
    const blue = [...drawnCells(layout, page).values()].filter((draw) => draw.color === COLOR_BLUE);
    expect(blue.length).toBe(0);

    tap(page, layout, at(5, 0, 0));
    expect(texts()).not.toContain(EN.swapped);
  });

  it("refuses taps while it is thinking", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 0, 0));
    expect(texts()).toContain(EN.thinking);

    tap(page, layout, at(5, 4, 4));
    vi.runOnlyPendingTimers();
    expect(drawnCells(layout, page).get(at(5, 4, 4)).color).not.toBe(COLOR_RED);
  });

  it("does not answer into a page that has been left", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 0, 0));
    button(EN.menu).tap();
    vi.runOnlyPendingTimers();
    expect(hasButton(EN.play)).toBe(true);
    expect(page.state.game).toBe(null);
  });

  it("gives up rather than asking itself again when there is nothing to play", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const layout = hexLayout(SCREEN, 5);
    tap(page, layout, at(5, 0, 0));

    // A board with no empty cell and no winner cannot arise from the rules; it
    // is forced here because what it must not do - ask for an answer that
    // changes nothing, over and over - would run until the battery died.
    page.state.game.cells.fill(1);
    vi.runOnlyPendingTimers();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("brings its own move into view when it lands off the screen", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 0, sizeIndex: 2 });
    const layout = hexLayout(SCREEN, 9);
    const limits = panLimits(layout, SCREEN, SCREEN_PADDING);
    expect(limits.x).toBeGreaterThan(0);

    // Drag the board hard to one side, then play - whatever the watch answers,
    // it must be somewhere the player can see.
    drag(page, { x: 233, y: 137 }, 5000, 5000);
    tap(page, layout, at(9, 0, 0));
    vi.runOnlyPendingTimers();

    const drawn = drawnCells(layout, page);
    const answered = [...drawn.entries()].filter(([, draw]) => draw.color === COLOR_BLUE);
    expect(answered.length).toBe(1);
    // Not merely drawn - clear of the bezel, which on a round screen is a
    // stricter thing than being inside the rectangle the board is drawn in.
    expect(
      isCellFullyVisible(
        layout,
        answered[0][0],
        page.state.panX,
        page.state.panY,
        SCREEN,
        SCREEN_PADDING
      )
    ).toBe(true);
  });

  it("plays a whole game out and names the winner as the player or the watch", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 0 });
    const layout = hexLayout(SCREEN, 5);
    for (let move = 0; move < 25 && !hasButton(EN.again); move++) {
      const drawn = drawnCells(layout, page);
      let free = -1;
      for (const [cell, draw] of drawn) {
        if (draw.color !== COLOR_RED && draw.color !== COLOR_BLUE) {
          free = cell;
          break;
        }
      }
      expect(free, "the board filled up without anybody winning").toBeGreaterThanOrEqual(0);
      tap(page, layout, free);
      vi.runOnlyPendingTimers();
    }
    expect(hasButton(EN.again)).toBe(true);
    const shown = texts();
    expect(shown.includes(EN.win_you) || shown.includes(EN.win_cpu)).toBe(true);
  });
});
