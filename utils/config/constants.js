// Pixels kept between anything drawn and the bezel, and the height reserved at
// the top and the bottom of the screen for the status line and the buttons. A
// Hex rhombus is far wider than it is tall, so on a round screen these caps come
// out at about a quarter of the diameter each without the board having to give
// anything up; the reserve is there so that stays true on a screen shape we have
// not seen.
export const SCREEN_PADDING = 8;
export const MIN_CAP = 96;

// Colors drawn on the (black) watch screen.
export const COLOR_BACKGROUND = 0x000000;

// An empty cell, and an empty cell on one of the four edges. Tinting the border
// cells is how each player is shown which two sides are theirs; the four corner
// cells carry an edge of each player, which is exactly how Hex counts them, so
// they get a colour of their own rather than being forced into one side.
export const COLOR_CELL = 0x232a31;
export const COLOR_CELL_RED_EDGE = 0x4d2028;
export const COLOR_CELL_BLUE_EDGE = 0x1b3550;
export const COLOR_CELL_BOTH_EDGES = 0x3a2b4a;

// The stones.
export const COLOR_RED = 0xf4593c;
export const COLOR_BLUE = 0x3f8ef0;

// The dot marking the stone played last, dark enough to read on either colour.
export const COLOR_MARK = 0x0d1117;

// Text and buttons.
export const COLOR_TEXT = 0xffffff;
export const COLOR_MUTED = 0x9aa4ab;
export const COLOR_BUTTON = 0x1d262c;
export const COLOR_BUTTON_PRESSED = 0x2f3d46;

// How long the screen stays lit while the app is open. A game of Hex is thought
// about rather than rushed, and a ten-second display timeout would black out
// mid-move, so the page asks for ten minutes and hands the setting back when it
// closes.
export const BRIGHT_TIME_MS = 600000;

// The watch answers on a timer rather than inside the tap that provoked it, so
// the screen has a chance to repaint and say it is thinking before the search
// takes the thread.
export const THINKING_DELAY_MS = 30;

// How far a finger may travel and still count as a tap rather than a drag. A
// fingertip never lands and lifts on exactly one pixel, so without some slack a
// board that can be dragged would swallow half the taps meant to place a stone.
export const DRAG_SLOP = 8;
