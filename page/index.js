import * as hmUI from "@zos/ui";
import { getLanguage } from "@zos/settings";
import { setPageBrightTime, resetPageBrightTime } from "@zos/display";
import { LocalStorage } from "@zos/storage";

import { RED } from "../lib/hex/board.js";
import {
  SEAT_FIRST,
  canSwap,
  createGame,
  isFinished,
  play,
  seatForColor,
  seatToMove,
  swapSides,
} from "../lib/hex/game.js";
import { LEVELS, chooseMove, clampLevel, nextLevel, shouldSwap } from "../lib/hex/ai.js";
import { hexLayout } from "../lib/layout/hex-layout.js";
import { cellAt } from "../lib/layout/hex-shape.js";
import {
  boardCommands,
  cellCommands,
  clearCommands,
  colorForCell,
  colorForStone,
  markCommands,
} from "../lib/paint.js";
import { centeredBox } from "../lib/round-geometry.js";
import { labelFor, languageFromZeppCode } from "../lib/i18n/index.js";
import {
  LEVEL_KEY,
  MODE_COMPUTER,
  MODE_KEY,
  SIZE_KEY,
  boardSizeFor,
  boardSizeLabel,
  clampMode,
  clampSizeIndex,
  nextMode,
  nextSizeIndex,
} from "../lib/settings.js";
import { SCREEN_SIZE } from "../utils/config/device.js";
import {
  BRIGHT_TIME_MS,
  COLOR_BACKGROUND,
  COLOR_BUTTON,
  COLOR_BUTTON_PRESSED,
  COLOR_MUTED,
  COLOR_TEXT,
  MIN_CAP,
  SCREEN_PADDING,
  THINKING_DELAY_MS,
} from "../utils/config/constants.js";

// Menu type scale, derived from the screen so it holds on any round size.
const TEXT_BIG = Math.round(SCREEN_SIZE * 0.105);
const TEXT_SMALL = Math.round(SCREEN_SIZE * 0.062);
const BUTTON_HEIGHT = Math.round(SCREEN_SIZE * 0.11);
const STACK_GAP = Math.round(SCREEN_SIZE * 0.018);
const MAX_MENU_WIDTH = Math.round(SCREEN_SIZE * 0.78);
const FOOTER_GAP = Math.round(SCREEN_SIZE * 0.02);

// A widget that failed to take a setting is not worth crashing a game over, and
// a watch that has no storage should still play - just without remembering. The
// in-memory copy keeps the chosen settings alive for the rest of the session.
const memory = {};

function readValue(storage, key) {
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      // Fall through to the in-memory copy.
    }
  }
  return memory[key];
}

function writeValue(storage, key, value) {
  memory[key] = value;
  if (storage) {
    try {
      storage.setItem(key, value);
    } catch {
      // The in-memory copy above still holds for this session.
    }
  }
}

Page({
  state: {
    language: "en",
    storage: null,
    mode: MODE_COMPUTER,
    level: 1,
    sizeIndex: 1,
    // "menu" while the settings are on screen, "playing" during a game, "over"
    // once it is won. The finished board is left visible rather than covered, so
    // the winning chain can be looked at.
    screen: "menu",
    game: null,
    layout: null,
    thinking: false,
    timer: null,
    destroyed: false,
    // Widgets, grouped by lifetime: the background lives as long as the page,
    // the board canvas as long as a game, and the status line, the footer and
    // the menu as long as a screen.
    canvas: null,
    canvasHeight: 0,
    // Which cell the last-move dot is currently drawn on. A canvas keeps no
    // scene graph, so moving the dot means painting that cell over first.
    markedCell: -1,
    status: null,
    footer: [],
    menu: [],
  },

  build() {
    // `state` above is an object literal, created once when this module is
    // evaluated, and Zepp OS may build a second page from the same definition
    // without re-evaluating it - leaving the app and coming back is enough. So
    // everything that belongs to one visit is cleared here rather than left to
    // the initialiser: without this, a rebuilt page would start with `destroyed`
    // still set and refuse every tap, holding handles to widgets that went with
    // the previous screen.
    this.state.destroyed = false;
    this.state.screen = "menu";
    this.state.game = null;
    this.state.layout = null;
    this.state.thinking = false;
    this.state.timer = null;
    this.state.canvas = null;
    this.state.canvasHeight = 0;
    this.state.markedCell = -1;
    this.state.status = null;
    this.state.footer = [];
    this.state.menu = [];

    try {
      this.state.language = languageFromZeppCode(getLanguage());
    } catch {
      // Some firmwares do not expose the setting; English rather than a blank
      // screen from a throw inside build().
    }

    try {
      this.state.storage = new LocalStorage();
    } catch {
      // No storage on this device: play on, remembering only for this session.
    }

    // A game outlasts the default ten-second display timeout, and a screen that
    // blacks out between moves is a game you have to wake up to finish. Handed
    // back in onDestroy.
    try {
      setPageBrightTime({ brightTime: BRIGHT_TIME_MS });
    } catch {
      // Not fatal: the watch just keeps its own timeout.
    }

    const storage = this.state.storage;
    this.state.mode = clampMode(readValue(storage, MODE_KEY));
    this.state.level = clampLevel(readValue(storage, LEVEL_KEY));
    this.state.sizeIndex = clampSizeIndex(readValue(storage, SIZE_KEY));

    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: SCREEN_SIZE,
      h: SCREEN_SIZE,
      color: COLOR_BACKGROUND,
    });

    this.showMenu();
  },

  onDestroy() {
    this.state.destroyed = true;
    this.stopTimer();
    try {
      resetPageBrightTime();
    } catch {
      // The setting is dropped with the page anyway.
    }
  },

  // ---------------------------------------------------------------- screens ----

  showMenu() {
    this.stopTimer();
    this.state.screen = "menu";
    this.state.thinking = false;
    this.state.game = null;
    this.clearBoard();
    this.clearStatus();
    this.clearFooter();

    const items = [
      { kind: "text", height: TEXT_BIG, color: COLOR_TEXT, text: this.text("title") },
      { kind: "gap", height: STACK_GAP },
      {
        kind: "button",
        height: BUTTON_HEIGHT,
        text: this.text(this.state.mode === MODE_COMPUTER ? "mode_cpu" : "mode_two"),
        onClick: () => this.cycleMode(),
      },
    ];
    if (this.state.mode === MODE_COMPUTER) {
      items.push({ kind: "gap", height: STACK_GAP });
      items.push({
        kind: "button",
        height: BUTTON_HEIGHT,
        text: this.text(LEVELS[this.state.level].label),
        onClick: () => this.cycleLevel(),
      });
    }
    items.push({ kind: "gap", height: STACK_GAP });
    items.push({
      kind: "button",
      height: BUTTON_HEIGHT,
      text: boardSizeLabel(this.state.sizeIndex),
      onClick: () => this.cycleSize(),
    });
    items.push({ kind: "gap", height: STACK_GAP });
    items.push({
      kind: "button",
      height: BUTTON_HEIGHT,
      text: this.text("play"),
      onClick: () => this.startGame(),
    });
    items.push({ kind: "gap", height: STACK_GAP });
    items.push({ kind: "text", height: TEXT_SMALL, color: COLOR_MUTED, text: this.text("hint") });

    this.drawMenu(items);
  },

  cycleMode() {
    this.state.mode = nextMode(this.state.mode);
    writeValue(this.state.storage, MODE_KEY, this.state.mode);
    this.showMenu();
  },

  cycleLevel() {
    this.state.level = nextLevel(this.state.level);
    writeValue(this.state.storage, LEVEL_KEY, this.state.level);
    this.showMenu();
  },

  cycleSize() {
    this.state.sizeIndex = nextSizeIndex(this.state.sizeIndex);
    writeValue(this.state.storage, SIZE_KEY, this.state.sizeIndex);
    this.showMenu();
  },

  startGame() {
    this.stopTimer();
    this.clearMenu();
    this.state.screen = "playing";
    this.state.thinking = false;
    const size = boardSizeFor(this.state.sizeIndex);
    this.state.game = createGame(size);
    if (!this.state.layout || this.state.layout.size !== size) {
      this.state.layout = hexLayout(SCREEN_SIZE, size, SCREEN_PADDING, MIN_CAP);
    }
    this.buildBoard();
    this.updateHud();
    this.maybeAnswer();
  },

  // ---------------------------------------------------------------- moves ----

  // Whether the seat is played by a person. Both seats are in two-player mode;
  // against the watch, the person always opens, and the pie rule is what keeps
  // that fair.
  isHumanSeat(seat) {
    return this.state.mode !== MODE_COMPUTER || seat === SEAT_FIRST;
  },

  onCellTap(cell) {
    if (this.state.destroyed || this.state.screen !== "playing" || this.state.thinking) {
      return;
    }
    const game = this.state.game;
    if (!game || !this.isHumanSeat(seatToMove(game))) {
      return;
    }
    if (!play(game, cell)) {
      return;
    }
    this.paintCell(cell);
    this.markLastMove();
    this.afterMove();
  },

  takeSwap() {
    const game = this.state.game;
    if (this.state.screen !== "playing" || this.state.thinking || !game) {
      return;
    }
    if (!this.isHumanSeat(seatToMove(game)) || !swapSides(game)) {
      return;
    }
    this.afterMove();
  },

  afterMove() {
    if (isFinished(this.state.game)) {
      this.state.screen = "over";
      this.updateHud();
      return;
    }
    this.updateHud();
    this.maybeAnswer();
  },

  // Hand over to the watch if it is the watch's turn. The search runs on a timer
  // rather than inside the tap, so the screen repaints and says it is thinking
  // before the thread is taken.
  maybeAnswer() {
    const game = this.state.game;
    if (!game || isFinished(game) || this.isHumanSeat(seatToMove(game))) {
      return;
    }
    this.state.thinking = true;
    this.updateHud();
    this.state.timer = setTimeout(() => this.answer(), THINKING_DELAY_MS);
  },

  answer() {
    this.state.timer = null;
    if (this.state.destroyed || this.state.screen !== "playing") {
      return;
    }
    const game = this.state.game;

    let answered = false;
    if (canSwap(game) && shouldSwap(game)) {
      answered = swapSides(game);
    } else {
      const move = chooseMove(game, { level: this.state.level });
      if (move >= 0 && play(game, move)) {
        this.paintCell(move);
        this.markLastMove();
        answered = true;
      }
    }

    this.state.thinking = false;

    if (!answered) {
      // Nothing to play, which the rules say cannot happen while a game is
      // unfinished - an unfinished Hex board always has an empty cell on it.
      // Stop anyway rather than carry on: afterMove() would see the same
      // position, ask for the same answer, and go round again for as long as
      // the watch had battery left.
      this.updateHud();
      return;
    }

    this.afterMove();
  },

  // ---------------------------------------------------------------- board ----

  // The board lives on one canvas, from the top of the screen down to the bottom
  // of the rhombus.
  //
  // Two things fix that shape. Its origin is (0, 0), so a point on the screen is
  // the same point on the canvas and no offset can be got wrong. And it stops
  // above the footer, because a canvas swallows the touches that land on it -
  // the sibling Sokoban app found that a button drawn over a listening canvas is
  // simply dead - so the buttons below the board have to sit outside it. The
  // status line above the board is only text and may overlap safely.
  boardCanvas() {
    const height = this.state.layout.bottom;
    // A canvas is sized once, when it is created, so one left over from a board
    // of a different size would be the wrong height: too short to draw the last
    // row of a bigger board, and deaf to taps on it. Today every size change
    // goes through the menu, which drops the canvas - but that is a habit of the
    // call sites rather than something this function can rely on.
    //
    // The height is remembered here rather than read back off the widget: a real
    // Zepp widget is an opaque handle with no properties to inspect, however
    // freely the test double lets one be read.
    if (this.state.canvas && this.state.canvasHeight !== height) {
      this.clearBoard();
    }
    if (this.state.canvas) {
      return this.state.canvas;
    }
    const canvas = hmUI.createWidget(hmUI.widget.CANVAS, {
      x: 0,
      y: 0,
      w: SCREEN_SIZE,
      h: height,
    });
    try {
      canvas.addEventListener(hmUI.event.CLICK_UP, (info) => this.onBoardTap(info));
    } catch {
      // A firmware that does not deliver canvas taps leaves a board that can be
      // read but not played, which still beats a page that threw while it was
      // being built and left the screen black.
    }
    this.state.canvas = canvas;
    this.state.canvasHeight = height;
    return canvas;
  },

  // Draw the whole board. The canvas keeps no scene graph, so the band is wiped
  // first: cells painted back to empty cannot uncover the stones underneath.
  buildBoard() {
    const canvas = this.boardCanvas();
    const game = this.state.game;
    this.state.markedCell = -1;
    this.run(canvas, clearCommands(this.state.layout, SCREEN_SIZE));
    this.run(canvas, boardCommands(this.state.layout, game.cells, game.topology.edges));
  },

  // One tap anywhere on the board: the canvas is a single widget, so where the
  // finger landed is all there is to go on.
  onBoardTap(info) {
    if (!info || this.state.destroyed) {
      return;
    }
    const cell = cellAt(this.state.layout, info.x, info.y);
    if (cell >= 0) {
      this.onCellTap(cell);
    }
  },

  paintCell(cell) {
    const canvas = this.state.canvas;
    if (!canvas) {
      return;
    }
    const game = this.state.game;
    const color = colorForCell(game.cells, game.topology.edges, cell);
    this.run(canvas, cellCommands(this.state.layout, cell, color));
  },

  // A dot on the stone played last, so a board of look-alike cells still shows
  // what just happened. Moving it means painting the cell it was on back first,
  // because nothing on a canvas can be picked up again once it is drawn.
  markLastMove() {
    const canvas = this.state.canvas;
    const cell = this.state.game.lastMove;
    if (!canvas || cell < 0) {
      return;
    }
    const previous = this.state.markedCell;
    if (previous >= 0 && previous !== cell) {
      this.paintCell(previous);
    }
    this.run(canvas, markCommands(this.state.layout, cell));
    this.state.markedCell = cell;
  },

  // Execute what lib/paint produced. The page knows these two shapes and nothing
  // else about how the board looks.
  run(canvas, commands) {
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.op === "rect") {
        canvas.drawRect({
          x1: command.x1,
          y1: command.y1,
          x2: command.x2,
          y2: command.y2,
          color: command.color,
        });
      } else if (command.op === "disc") {
        canvas.drawCircle({
          center_x: command.x,
          center_y: command.y,
          radius: command.radius,
          color: command.color,
        });
      }
    }
  },

  // ---------------------------------------------------------------- hud ----

  updateHud() {
    this.drawStatus();
    this.drawFooter();
  },

  // What the line above the board says, and in which colour: whose turn it is,
  // that the watch is thinking, or who won.
  statusLine() {
    const game = this.state.game;
    if (!game) {
      return null;
    }
    if (this.state.thinking) {
      return { key: "thinking", color: COLOR_MUTED };
    }
    const versusWatch = this.state.mode === MODE_COMPUTER;
    if (isFinished(game)) {
      const color = colorForStone(game.winner);
      if (versusWatch) {
        return {
          key: seatForColor(game, game.winner) === SEAT_FIRST ? "win_you" : "win_cpu",
          color,
        };
      }
      return { key: game.winner === RED ? "win_red" : "win_blue", color };
    }
    const color = colorForStone(game.turn);
    if (versusWatch) {
      return { key: seatToMove(game) === SEAT_FIRST ? "turn_you" : "turn_cpu", color };
    }
    return { key: game.turn === RED ? "turn_red" : "turn_blue", color };
  },

  drawStatus() {
    this.clearStatus();
    const line = this.statusLine();
    if (!line) {
      return;
    }
    const cap = this.state.layout.top;
    const height = Math.round(cap * 0.44);
    const box = centeredBox(
      SCREEN_SIZE,
      Math.round(cap * 0.3),
      height,
      MAX_MENU_WIDTH,
      SCREEN_PADDING
    );
    this.state.status = this.createText(
      box,
      Math.round(height * 0.78),
      line.color,
      this.text(line.key)
    );
  },

  // The buttons in the cap below the board: always a way back to the menu, plus
  // whatever the game is waiting for - the pie rule while it is on offer, a fresh
  // game once this one is over.
  footerButtons() {
    const game = this.state.game;
    const back = { text: this.text("menu"), onClick: () => this.showMenu() };
    if (!game) {
      return [];
    }
    if (this.state.screen === "over") {
      return [{ text: this.text("again"), onClick: () => this.startGame() }, back];
    }
    if (canSwap(game) && !this.state.thinking && this.isHumanSeat(seatToMove(game))) {
      return [{ text: this.text("swap"), onClick: () => this.takeSwap() }, back];
    }
    return [back];
  },

  drawFooter() {
    this.clearFooter();
    const buttons = this.footerButtons();
    if (buttons.length === 0) {
      return;
    }

    const layout = this.state.layout;
    const cap = SCREEN_SIZE - layout.bottom;
    const height = Math.round(cap * 0.46);
    const row = centeredBox(
      SCREEN_SIZE,
      layout.bottom + Math.round(cap * 0.22),
      height,
      MAX_MENU_WIDTH,
      SCREEN_PADDING
    );

    const gap = buttons.length > 1 ? FOOTER_GAP : 0;
    const width = Math.floor((row.w - gap * (buttons.length - 1)) / buttons.length);
    for (let i = 0; i < buttons.length; i++) {
      const box = { x: row.x + i * (width + gap), y: row.y, w: width, h: row.h };
      this.state.footer.push(this.createButton(box, buttons[i].text, buttons[i].onClick));
    }
  },

  // ---------------------------------------------------------------- menu ----

  // A vertical stack of texts and buttons, centred on the screen.
  drawMenu(items) {
    this.clearMenu();

    let height = 0;
    for (let i = 0; i < items.length; i++) {
      height += items[i].height;
    }

    let y = Math.round((SCREEN_SIZE - height) / 2);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "gap") {
        const box = centeredBox(SCREEN_SIZE, y, item.height, MAX_MENU_WIDTH, SCREEN_PADDING);
        if (item.kind === "button") {
          this.state.menu.push(this.createButton(box, item.text, item.onClick));
        } else {
          this.state.menu.push(
            this.createText(box, Math.round(item.height * 0.78), item.color, item.text)
          );
        }
      }
      y += item.height;
    }
  },

  createText(box, size, color, text) {
    return hmUI.createWidget(hmUI.widget.TEXT, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      color,
      text_size: size,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.NONE,
      text,
    });
  },

  createButton(box, text, onClick) {
    return hmUI.createWidget(hmUI.widget.BUTTON, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      radius: Math.round(box.h / 2),
      normal_color: COLOR_BUTTON,
      press_color: COLOR_BUTTON_PRESSED,
      color: COLOR_TEXT,
      text_size: Math.round(box.h * 0.42),
      text,
      click_func: onClick,
    });
  },

  // ---------------------------------------------------------------- teardown ----

  stopTimer() {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }
  },

  // The canvas goes when the board does, and it must: left listening under the
  // menu it would swallow every tap meant for the buttons drawn on top of it.
  clearBoard() {
    if (this.state.canvas) {
      hmUI.deleteWidget(this.state.canvas);
      this.state.canvas = null;
      this.state.canvasHeight = 0;
    }
    this.state.markedCell = -1;
  },

  clearStatus() {
    if (this.state.status) {
      hmUI.deleteWidget(this.state.status);
      this.state.status = null;
    }
  },

  clearFooter() {
    for (let i = 0; i < this.state.footer.length; i++) {
      hmUI.deleteWidget(this.state.footer[i]);
    }
    this.state.footer = [];
  },

  clearMenu() {
    for (let i = 0; i < this.state.menu.length; i++) {
      hmUI.deleteWidget(this.state.menu[i]);
    }
    this.state.menu = [];
  },

  text(key) {
    return labelFor(this.state.language, key);
  },
});
