import * as hmUI from "@zos/ui";
import { getLanguage } from "@zos/settings";
import { setPageBrightTime, resetPageBrightTime } from "@zos/display";
import { LocalStorage } from "@zos/storage";

import {
  EDGE_BLUE_END,
  EDGE_BLUE_START,
  EDGE_RED_END,
  EDGE_RED_START,
  RED,
} from "../lib/hex/board.js";
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
import {
  cellAt,
  cellCenterX,
  cellCenterY,
  clampPan,
  hexCorners,
  hexLayout,
  isCellVisible,
  panLimits,
  panToCell,
} from "../lib/layout/hex-layout.js";
import { centeredBox } from "../lib/round-geometry.js";
import { labelFor, languageFromZeppCode } from "../lib/i18n/index.js";
import {
  LEVEL_KEY,
  MODE_COMPUTER,
  MODE_KEY,
  SIZE_KEY,
  SWAP_KEY,
  boardSizeFor,
  boardSizeLabel,
  clampMode,
  clampSizeIndex,
  clampSwap,
  nextMode,
  nextSizeIndex,
  nextSwap,
  swapLabelKey,
  swapRuleEnabled,
} from "../lib/settings.js";
import { SCREEN_SIZE } from "../utils/config/device.js";
import {
  BRIGHT_TIME_MS,
  COLOR_BACKGROUND,
  COLOR_BLUE,
  COLOR_BUTTON,
  COLOR_BUTTON_PRESSED,
  COLOR_CELL,
  COLOR_CELL_BLUE_EDGE,
  COLOR_CELL_BOTH_EDGES,
  COLOR_CELL_RED_EDGE,
  COLOR_MARK,
  COLOR_MUTED,
  COLOR_RED,
  COLOR_TEXT,
  DRAG_SLOP,
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

// The board lives in the band between the two caps, which hold the status line
// and the buttons. Everything the board draws, and every touch it answers, is in
// this box's own coordinates.
const VIEW = {
  x: 0,
  y: MIN_CAP,
  w: SCREEN_SIZE,
  h: SCREEN_SIZE - 2 * MIN_CAP,
};
const VIEW_MIDDLE_X = Math.round(VIEW.w / 2);
const VIEW_MIDDLE_Y = Math.round(VIEW.h / 2);

const RED_EDGES = EDGE_RED_START | EDGE_RED_END;
const BLUE_EDGES = EDGE_BLUE_START | EDGE_BLUE_END;

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

function colorForStone(color) {
  return color === RED ? COLOR_RED : COLOR_BLUE;
}

// What an empty cell is painted: plain in the middle of the board, tinted along
// an edge to show whose side it is. The corners belong to one edge of each
// player and are painted as such rather than being assigned to one of them.
function colorForEmptyCell(edges) {
  const red = (edges & RED_EDGES) !== 0;
  const blue = (edges & BLUE_EDGES) !== 0;
  if (red && blue) {
    return COLOR_CELL_BOTH_EDGES;
  }
  if (red) {
    return COLOR_CELL_RED_EDGE;
  }
  if (blue) {
    return COLOR_CELL_BLUE_EDGE;
  }
  return COLOR_CELL;
}

Page({
  state: {
    language: "en",
    storage: null,
    mode: MODE_COMPUTER,
    level: 1,
    sizeIndex: 1,
    swap: 1,
    // "menu" while the settings are on screen, "playing" during a game, "over"
    // once it is won. The finished board is left visible rather than covered, so
    // the winning chain can be looked at.
    screen: "menu",
    game: null,
    layout: null,
    thinking: false,
    // Set when the pie rule has just been used, so the screen can say so. A swap
    // is otherwise invisible: the stone stays where it was and keeps its colour,
    // and all that changes is which side of it each player is on.
    swapped: false,
    timer: null,
    destroyed: false,
    // Where the middle of the board has been dragged to, relative to the middle
    // of the viewport, and what the finger is currently doing.
    panX: 0,
    panY: 0,
    panLimit: { x: 0, y: 0 },
    touching: false,
    touchX: 0,
    touchY: 0,
    startPanX: 0,
    startPanY: 0,
    dragged: false,
    // How far the canvas widget itself is currently shifted from where it lives.
    // A drag slides the widget, which costs one property write; the hexagons on
    // it are only repainted once, when the finger lifts.
    slideX: 0,
    slideY: 0,
    // Widgets, grouped by lifetime: the background lives as long as the page,
    // the board canvas as long as a game, and the status line, the footer and
    // the menu as long as a screen.
    canvas: null,
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
    this.state.swapped = false;
    this.state.timer = null;
    this.resetPan();
    this.state.canvas = null;
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
    this.state.swap = clampSwap(readValue(storage, SWAP_KEY));

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
    this.state.swapped = false;
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
      text: this.text(swapLabelKey(this.state.swap)),
      onClick: () => this.cycleSwap(),
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

  cycleSwap() {
    this.state.swap = nextSwap(this.state.swap);
    writeValue(this.state.storage, SWAP_KEY, this.state.swap);
    this.showMenu();
  },

  startGame() {
    this.stopTimer();
    this.clearMenu();
    this.state.screen = "playing";
    this.state.thinking = false;
    this.state.swapped = false;
    const size = boardSizeFor(this.state.sizeIndex);
    this.state.game = createGame(size, { swapRule: swapRuleEnabled(this.state.swap) });
    this.state.layout = hexLayout(SCREEN_SIZE, size);
    this.resetPan();
    this.state.panLimit = panLimits(this.state.layout, VIEW.w, VIEW.h);
    this.buildBoard();
    this.drawBoard();
    this.updateHud();
    this.maybeAnswer();
  },

  resetPan() {
    this.state.panX = 0;
    this.state.panY = 0;
    this.state.slideX = 0;
    this.state.slideY = 0;
    this.state.touching = false;
    this.state.dragged = false;
  },

  // Put the canvas back where it belongs, plus whatever a drag in progress has
  // slid it by. Moving the widget is the cheap half of panning: repainting the
  // board costs a hundred times as much, so it waits until the finger is up.
  placeCanvas() {
    if (!this.state.canvas) {
      return;
    }
    this.state.canvas.setProperty(hmUI.prop.MORE, {
      x: VIEW.x + this.state.slideX,
      y: VIEW.y + this.state.slideY,
      w: VIEW.w,
      h: VIEW.h,
    });
  },

  // ---------------------------------------------------------------- moves ----

  // Whether the seat is played by a person. Both seats are in two-player mode;
  // against the watch, the person always opens, and the pie rule is what keeps
  // that fair.
  isHumanSeat(seat) {
    return this.state.mode !== MODE_COMPUTER || seat === SEAT_FIRST;
  },

  placeStone(cell) {
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
    // The player has answered, so the notice has been read.
    this.state.swapped = false;
    this.drawBoard();
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
    this.state.swapped = true;
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
      this.state.swapped = answered;
    } else {
      const move = chooseMove(game, { level: this.state.level });
      if (move >= 0 && play(game, move)) {
        // The watch may well answer somewhere the board has been dragged away
        // from, so bring its stone into view rather than leaving the player to
        // hunt for what changed.
        this.revealCell(move);
        answered = true;
      }
    }

    this.state.thinking = false;
    this.drawBoard();

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

  buildBoard() {
    this.clearBoard();
    this.state.canvas = hmUI.createWidget(hmUI.widget.CANVAS, {
      x: VIEW.x,
      y: VIEW.y,
      w: VIEW.w,
      h: VIEW.h,
    });
    this.listenToBoard(this.state.canvas);
  },

  listenToBoard(canvas) {
    try {
      canvas.addEventListener(hmUI.event.CLICK_DOWN, (info) => this.onTouchDown(info));
      canvas.addEventListener(hmUI.event.MOVE, (info) => this.onTouchMove(info));
      canvas.addEventListener(hmUI.event.CLICK_UP, (info) => this.onTouchUp(info));
    } catch {
      // A firmware that does not deliver touch on a canvas leaves a board that
      // can be read but not played, which still beats a page that threw while
      // it was being built and left the screen black.
    }
  },

  // Where the middle of the board currently sits inside the viewport.
  originX() {
    return VIEW_MIDDLE_X + this.state.panX;
  },

  originY() {
    return VIEW_MIDDLE_Y + this.state.panY;
  },

  drawBoard() {
    const canvas = this.state.canvas;
    const layout = this.state.layout;
    const game = this.state.game;
    if (!canvas || !layout || !game) {
      return;
    }

    canvas.clear({ x: 0, y: 0, w: VIEW.w, h: VIEW.h });

    const originX = this.originX();
    const originY = this.originY();
    const edges = game.topology.edges;

    for (let cell = 0; cell < layout.cellCount; cell++) {
      // On the biggest board most of the hexagons are scrolled out of sight, and
      // drawing them would cost the same as drawing the ones you can see.
      if (!isCellVisible(layout, cell, originX, originY, 0, 0, VIEW.w, VIEW.h)) {
        continue;
      }
      const stone = game.cells[cell];
      canvas.drawPoly({
        data_array: hexCorners(layout, cell, originX, originY),
        color: stone ? colorForStone(stone) : colorForEmptyCell(edges[cell]),
      });
    }

    // A dot on the stone played last, so a board of look-alike hexagons still
    // shows what just happened.
    const last = game.lastMove;
    if (last >= 0 && isCellVisible(layout, last, originX, originY, 0, 0, VIEW.w, VIEW.h)) {
      canvas.drawCircle({
        center_x: cellCenterX(layout, last, originX),
        center_y: cellCenterY(layout, last, originY),
        radius: Math.max(2, Math.round(layout.scale * 0.22)),
        color: COLOR_MARK,
      });
    }
  },

  // ---------------------------------------------------------------- touch ----

  onTouchDown(info) {
    if (this.state.screen === "menu" || !this.state.layout) {
      return;
    }
    this.state.touching = true;
    this.state.dragged = false;
    this.state.touchX = info.x;
    this.state.touchY = info.y;
    this.state.startPanX = this.state.panX;
    this.state.startPanY = this.state.panY;
  },

  // Dragging moves the board under the finger. Until the finger has travelled
  // further than the slop, the touch is still a candidate for a tap - a fingertip
  // never lands and lifts on exactly one pixel.
  onTouchMove(info) {
    if (!this.state.touching) {
      return;
    }
    const dx = info.x - this.state.touchX;
    const dy = info.y - this.state.touchY;
    if (!this.state.dragged && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) {
      return;
    }
    this.state.dragged = true;
    const limit = this.state.panLimit;
    const wantX = clampPan(this.state.startPanX + dx, limit.x);
    const wantY = clampPan(this.state.startPanY + dy, limit.y);
    this.state.slideX = wantX - this.state.panX;
    this.state.slideY = wantY - this.state.panY;
    this.placeCanvas();
  },

  onTouchUp(info) {
    if (!this.state.touching) {
      return;
    }
    this.state.touching = false;
    if (this.state.dragged) {
      this.state.dragged = false;
      // Fold the slide into the pan and repaint once, which fills back in the
      // edges the slide left blank.
      this.state.panX += this.state.slideX;
      this.state.panY += this.state.slideY;
      this.state.slideX = 0;
      this.state.slideY = 0;
      this.placeCanvas();
      this.drawBoard();
      return;
    }
    const cell = cellAt(
      this.state.layout,
      this.originX() + this.state.slideX,
      this.originY() + this.state.slideY,
      info.x,
      info.y
    );
    if (cell >= 0) {
      this.placeStone(cell);
    }
  },

  // Pan so a cell is in the middle of the viewport, as far as the board's own
  // edges allow. A board that fits does not move.
  revealCell(cell) {
    const layout = this.state.layout;
    if (!layout) {
      return;
    }
    if (isCellVisible(layout, cell, this.originX(), this.originY(), 0, 0, VIEW.w, VIEW.h)) {
      return;
    }
    const pan = panToCell(layout, cell, VIEW.w, VIEW.h);
    this.state.panX = pan.x;
    this.state.panY = pan.y;
    this.state.slideX = 0;
    this.state.slideY = 0;
    this.placeCanvas();
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
    // Said once, in the colour whoever is now to move will be playing, so the
    // notice also answers the question it raises: which side am I on now?
    if (this.state.swapped && !isFinished(game)) {
      return { key: "swapped", color: colorForStone(game.turn) };
    }
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
    const height = Math.round(MIN_CAP * 0.44);
    const box = centeredBox(
      SCREEN_SIZE,
      Math.round(MIN_CAP * 0.3),
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

    const capTop = VIEW.y + VIEW.h;
    const cap = SCREEN_SIZE - capTop;
    const height = Math.round(cap * 0.46);
    const row = centeredBox(
      SCREEN_SIZE,
      capTop + Math.round(cap * 0.22),
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

  clearBoard() {
    if (this.state.canvas) {
      hmUI.deleteWidget(this.state.canvas);
      this.state.canvas = null;
    }
    this.state.touching = false;
    this.state.dragged = false;
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
