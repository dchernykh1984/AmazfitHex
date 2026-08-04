import { describe, it, expect, afterEach, vi } from "vitest";
import { LABELS } from "../lib/i18n/labels.js";
import { MODE_KEY, MODE_TWO_PLAYERS, SIZE_KEY, LEVEL_KEY } from "../lib/settings.js";
import { hexLayout } from "../lib/layout/hex-layout.js";
import { COLOR_BLUE, COLOR_RED } from "../utils/config/constants.js";

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

function button(text) {
  const found = widgetsOfType(ui.widget.BUTTON).filter((w) => w.properties.text === text);
  expect(found.length, `expected exactly one "${text}" button, saw ${found.length}`).toBe(1);
  return found[0];
}

function hasButton(text) {
  return widgetsOfType(ui.widget.BUTTON).some((w) => w.properties.text === text);
}

// The board cells, in board order, matched to the layout the page draws them at.
function cells(size) {
  const layout = hexLayout(466, size, 8, 96);
  const found = [];
  for (let cell = 0; cell < layout.cellCount; cell++) {
    const x = layout.centersX[cell] - layout.radius;
    const y = layout.centersY[cell] - layout.radius;
    const match = ui.screen.widgets.find(
      (w) =>
        w.type === ui.widget.FILL_RECT &&
        w.properties.x === x &&
        w.properties.y === y &&
        w.properties.w === layout.radius * 2
    );
    expect(match, `no widget for cell ${cell}`).toBeTruthy();
    found.push(match);
  }
  return found;
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
function playUpToRedsWin(board, size) {
  for (let row = 0; row < size - 1; row++) {
    board[at(size, 2, row)].tap();
    board[at(size, 4, row)].tap();
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
    const board = cells(5);
    board[at(5, 2, 2)].tap();
    expect(board[at(5, 2, 2)].properties.color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });
});

describe("a game between two players", () => {
  it("draws one cell per board cell and says whose turn it is", async () => {
    await startGame();
    expect(cells(5).length).toBe(25);
    expect(texts()).toContain(EN.turn_red);
    expect(hasButton(EN.menu)).toBe(true);
  });

  it("puts a stone down where it is tapped and passes the turn", async () => {
    await startGame();
    const board = cells(5);
    board[at(5, 2, 2)].tap();
    expect(board[at(5, 2, 2)].properties.color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);

    // The pie rule is on offer now, so blue answers by tapping rather than by
    // taking the stone.
    board[at(5, 0, 0)].tap();
    expect(board[at(5, 0, 0)].properties.color).toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.turn_red);
  });

  it("ignores a tap on a cell that already has a stone on it", async () => {
    await startGame();
    const board = cells(5);
    board[at(5, 2, 2)].tap();
    board[at(5, 2, 2)].tap();
    expect(board[at(5, 2, 2)].properties.color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_blue);
  });

  it("offers the pie rule once, to the second player only", async () => {
    await startGame();
    const board = cells(5);
    expect(hasButton(EN.swap)).toBe(false);

    board[at(5, 2, 2)].tap();
    expect(hasButton(EN.swap)).toBe(true);

    button(EN.swap).tap();
    // The opening stone changed hands, so it is the opener who now moves - and
    // plays blue.
    expect(hasButton(EN.swap)).toBe(false);
    expect(texts()).toContain(EN.turn_blue);
    expect(board[at(5, 2, 2)].properties.color).toBe(COLOR_RED);
  });

  it("drops the pie rule as soon as the second player answers with a stone", async () => {
    await startGame();
    const board = cells(5);
    board[at(5, 2, 2)].tap();
    board[at(5, 0, 0)].tap();
    expect(hasButton(EN.swap)).toBe(false);
  });

  it("announces the winner, leaves the board up and offers another game", async () => {
    await startGame();
    const board = cells(5);
    playUpToRedsWin(board, 5);
    expect(texts()).toContain(EN.turn_red);

    board[at(5, 2, 4)].tap();
    expect(texts()).toContain(EN.win_red);
    expect(hasButton(EN.again)).toBe(true);
    expect(hasButton(EN.menu)).toBe(true);
    expect(board[at(5, 2, 4)].properties.color).toBe(COLOR_RED);
  });

  it("stops taking moves once the game is won", async () => {
    await startGame();
    const board = cells(5);
    playUpToRedsWin(board, 5);
    board[at(5, 2, 4)].tap();

    board[at(5, 1, 1)].tap();
    expect(board[at(5, 1, 1)].properties.color).not.toBe(COLOR_BLUE);
    expect(texts()).toContain(EN.win_red);
  });

  it("deals another hand on the cells already drawn rather than redrawing them", async () => {
    await startGame();
    const board = cells(5);
    playUpToRedsWin(board, 5);
    board[at(5, 2, 4)].tap();

    button(EN.again).tap();
    const again = cells(5);
    // The same widgets, painted back to empty: a new board costs no widget
    // churn on a watch that can ill afford it.
    expect(again).toEqual(board);
    expect(again.every((cell) => cell.properties.color !== COLOR_RED)).toBe(true);
    expect(again.every((cell) => cell.properties.color !== COLOR_BLUE)).toBe(true);
    expect(texts()).toContain(EN.turn_red);

    // And it still plays.
    again[at(5, 1, 1)].tap();
    expect(again[at(5, 1, 1)].properties.color).toBe(COLOR_RED);
  });

  it("redraws the board when the size chosen in the menu changed", async () => {
    await startGame();
    const board = cells(5);
    button(EN.menu).tap();
    button("5x5").tap();
    button(EN.play).tap();

    const bigger = cells(7);
    expect(bigger.length).toBe(49);
    for (const cell of board) {
      expect(cell.deleted).toBe(true);
    }
  });

  it("goes back to the menu, and to a board of the size chosen there", async () => {
    await startGame();
    button(EN.menu).tap();
    expect(hasButton(EN.play)).toBe(true);
    // Only the page background is left drawn.
    expect(widgetsOfType(ui.widget.FILL_RECT).length).toBe(1);

    button("5x5").tap();
    button(EN.play).tap();
    expect(cells(7).length).toBe(49);
  });
});

describe("a game against the watch", () => {
  it("answers on its own once the player has moved", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const board = cells(5);
    expect(texts()).toContain(EN.turn_you);

    board[at(5, 0, 0)].tap();
    // A corner opening is not worth taking over, so the watch answers with a
    // stone of its own rather than with the pie rule.
    expect(texts()).toContain(EN.thinking);
    vi.runOnlyPendingTimers();

    expect(board.filter((cell) => cell.properties.color === COLOR_BLUE).length).toBe(1);
    expect(texts()).toContain(EN.turn_you);
  });

  it("takes the opening stone when it is worth taking", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const board = cells(5);
    board[at(5, 2, 2)].tap();
    vi.runOnlyPendingTimers();

    // Having taken red, the watch leaves the player on blue and to move.
    expect(board.filter((cell) => cell.properties.color === COLOR_BLUE).length).toBe(0);
    expect(board[at(5, 2, 2)].properties.color).toBe(COLOR_RED);
    expect(texts()).toContain(EN.turn_you);
  });

  it("never offers the player the pie rule, because the watch decides it", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const board = cells(5);
    board[at(5, 0, 0)].tap();
    expect(hasButton(EN.swap)).toBe(false);
    vi.runOnlyPendingTimers();
    expect(hasButton(EN.swap)).toBe(false);
  });

  it("refuses taps while it is thinking", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 1 });
    const board = cells(5);
    board[at(5, 0, 0)].tap();
    expect(texts()).toContain(EN.thinking);

    board[at(5, 4, 4)].tap();
    expect(board[at(5, 4, 4)].properties.color).not.toBe(COLOR_RED);
    vi.runOnlyPendingTimers();
    expect(board[at(5, 4, 4)].properties.color).not.toBe(COLOR_RED);
  });

  it("does not answer into a page that has been left", async () => {
    vi.useFakeTimers();
    const page = await startGame({ mode: 1, level: 1 });
    const board = cells(5);
    board[at(5, 0, 0)].tap();
    button(EN.menu).tap();
    vi.runOnlyPendingTimers();
    expect(hasButton(EN.play)).toBe(true);
    expect(page.state.game).toBe(null);
  });

  it("plays a whole game out and names the winner as the player or the watch", async () => {
    vi.useFakeTimers();
    await startGame({ mode: 1, level: 0 });
    const board = cells(5);
    const empty = (cell) =>
      cell.properties.color !== COLOR_RED && cell.properties.color !== COLOR_BLUE;
    // The player fills the first free cell it finds and the watch answers, so
    // between them the board runs out - and a full Hex board always has a
    // winner, whichever of the two it turns out to be.
    for (let move = 0; move < 25 && !hasButton(EN.again); move++) {
      const free = board.find(empty);
      expect(free, "the board filled up without anybody winning").toBeTruthy();
      free.tap();
      vi.runOnlyPendingTimers();
    }
    expect(hasButton(EN.again)).toBe(true);
    const shown = texts();
    expect(shown.includes(EN.win_you) || shown.includes(EN.win_cpu)).toBe(true);
  });
});

describe("the last-move mark", () => {
  it("follows the stone that was played last and is drawn only once", async () => {
    await startGame();
    const layout = hexLayout(466, 5, 8, 96);
    const board = cells(5);
    board[at(5, 2, 2)].tap();

    const marks = widgetsOfType(ui.widget.FILL_RECT).filter(
      (w) => !board.includes(w) && w.properties.w < layout.radius * 2
    );
    expect(marks.length).toBe(1);
    const mark = marks[0];
    expect(mark.properties.x + mark.properties.w / 2).toBe(layout.centersX[at(5, 2, 2)]);

    board[at(5, 0, 0)].tap();
    expect(mark.properties.x + mark.properties.w / 2).toBe(layout.centersX[at(5, 0, 0)]);
    expect(
      widgetsOfType(ui.widget.FILL_RECT).filter(
        (w) => !board.includes(w) && w.properties.w < layout.radius * 2
      ).length
    ).toBe(1);
  });
});
