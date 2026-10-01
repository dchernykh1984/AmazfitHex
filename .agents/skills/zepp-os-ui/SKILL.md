---
name: zepp-os-ui
description: What actually draws and what silently does not on Zepp OS, which coordinate space each API speaks, and what a frame costs. Load this before writing or changing any drawing or touch code in page/index.js, before choosing a widget type, and before trusting a rendering that only ever ran in the simulator.
---

# Drawing and touch on Zepp OS

Everything here was measured on this project or recorded first-hand by a sibling
app. The platform accepts a great deal that it then does not draw, so **an API
call returning without throwing proves nothing**.

## The rule that matters most

> The simulator and the watch disagree. A thing that renders in the simulator can
> render as nothing at all on the device, without an error anywhere.

So: prefer primitives that a shipped sibling app has drawn on real hardware, and
treat "it looked right in the simulator" as one data point, not as proof.

## Widgets

| Widget      | Status                                                                     |
| ----------- | -------------------------------------------------------------------------- |
| `FILL_RECT` | Safe. Supports `radius` (a full-radius square is a disc) and touch events  |
| `TEXT`      | Safe. No auto-shrink: an over-long string is clipped, so budget characters |
| `BUTTON`    | Safe. `click_func`, `normal_color`, `press_color`                          |
| `CANVAS`    | Draws, and can be created larger than the screen. See the traps below      |

`setProperty(hmUI.prop.MORE, {...})` works on `FILL_RECT` and `TEXT`. When you
update geometry you must pass `x`, `y`, `w` and `h` together, not just the one
that changed.

## Canvas traps

Three of these cost real time to find. Do not re-find them.

1. **`drawPoly` is not trustworthy on device.** It fills a polygon in the
   simulator and looks perfect. `AmazfitSokoban` records that the watch accepts a
   polygon without complaint and then draws nothing at all - it shipped invisible
   arrows that way, and no test caught it because a test double happily records a
   polygon nobody ever sees. If the board must be polygons, say so out loud as a
   risk and get it checked on hardware before submitting to the store.
2. **Moving a canvas widget does nothing.** `setProperty` with a new `x`/`y` on a
   `CANVAS` returns instantly and leaves the canvas exactly where it was. A
   benchmark that times the call measures the call, not the effect - always
   confirm a position change with a screenshot.
3. **Drawing coordinates are canvas-local; touch coordinates are not.** What you
   draw is placed relative to the canvas widget's own top-left. What arrives in a
   touch handler's `info.x` / `info.y` is in **screen** space. Subtract the
   widget's origin before matching a touch to anything you drew.

To prove which space a drawing call is in, render something whose position
differs measurably between the two interpretations - a board that does not fill
the widget - and look at where it lands. Both readings look identical for content
that overflows, so a full-bleed test proves nothing.

`clear({x, y, w, h})` leaves the canvas transparent, showing the page background
through it. It does not need a backdrop painted over it. (A dark board of packed
cells reads as a pale slab against pure black; that is the content, not a canvas
background. Sample the pixels before believing a screenshot.)

## What a frame costs

Measured in the simulator, 59 visible hexagons on a 466px screen:

| Approach                     | Cost per full board repaint |
| ---------------------------- | --------------------------- |
| `drawPoly`, one per cell     | ~120 ms                     |
| `drawRect`, seven per cell   | ~131 ms                     |
| `drawLine`, six per cell     | ~226 ms                     |
| Whole 81-cell board, polygon | ~199 ms                     |

Per call that is roughly 2 ms for a polygon, 0.6 ms for a line, 0.3 ms for a
rectangle. **A full canvas repaint per input event is not affordable.** If
something has to move under a finger, either repaint on a movement threshold
(this project uses 10 px) or find a way not to repaint at all - but not by moving
the canvas, which does not work.

Widget creation is comparatively cheap: the app happily created 81 `FILL_RECT`
cells at once with no visible stall. One widget per cell is a legitimate design;
it is the per-frame rasterising that is not.

## Round screens

The screen is a circle, so the corners of any rectangle you reason about are
under the bezel. Two consequences that both caused bugs here:

- Clamping a pan to "the content edge meets the viewport edge" leaves the content
  corners permanently hidden. Clamp against the **circle**: for each cell work out
  what it needs to reach the visible radius, and take the worst.
- "Visible" has to mean inside the circle **and** inside the widget the content is
  drawn on. A cell can satisfy the circle test while sitting past the edge of a
  canvas that is shorter than the screen.

`lib/round-geometry.js` has the chord helpers for keeping text and buttons inside
the circle at a given height.

## Debugging on the device

`console.log` from app code goes to the simulator's own console, **not** to the
`zeus dev` output, so it is invisible from a terminal. To get a number out, draw
it: create a `TEXT` widget with the value in it and take a screenshot. That is
how the frame costs above were measured.
