// The shape of one hexagon, and which hexagon a tap landed in.
//
// Pure geometry, no Zepp OS: the page turns these numbers into canvas calls and
// the tests check them without a watch.
//
// FILLING A HEXAGON WITHOUT A POLYGON PRIMITIVE
//
// The canvas does have `drawPoly`, and it is a trap: on a real watch it is
// accepted without complaint and then draws nothing at all. The sibling Sokoban
// app hit exactly this - its arrows were invisible on hardware while every
// line-drawn icon appeared - and abandoned it. Only `drawRect`, `drawCircle`,
// `strokeCircle` and `drawLine` are known to work, and the failure does not
// reproduce in the simulator, so it cannot be caught before shipping.
//
// So a hexagon is filled the way a rasteriser would do it: a pointy-topped
// hexagon is one rectangle across its middle band plus two triangular caps, and
// each cap is a short stack of one-pixel rows. Every piece is a `drawRect`, the
// one fill primitive that is proven on the device.

const SQRT3 = Math.sqrt(3);

// Half the width of a pointy-topped hexagon of the given circumradius. Its
// corners are at the top and the bottom, so it is taller than it is wide.
export function hexHalfWidth(radius) {
  return (SQRT3 * radius) / 2;
}

// The six corners, clockwise from the top. Only the tests and any future
// outline drawing need these; the fill is built from spans instead.
export function hexCorners(centerX, centerY, radius) {
  const half = hexHalfWidth(radius);
  const quarter = radius / 2;
  return [
    { x: centerX, y: centerY - radius },
    { x: centerX + half, y: centerY - quarter },
    { x: centerX + half, y: centerY + quarter },
    { x: centerX, y: centerY + radius },
    { x: centerX - half, y: centerY + quarter },
    { x: centerX - half, y: centerY - quarter },
  ];
}

// Whether a point is inside the hexagon, used by the tests to check that the
// spans below really do cover the shape.
export function insideHex(centerX, centerY, radius, x, y) {
  const dx = Math.abs(x - centerX);
  const dy = Math.abs(y - centerY);
  const half = hexHalfWidth(radius);
  if (dx > half || dy > radius) {
    return false;
  }
  // Each slanted side runs from (half, radius/2) to (0, radius), so the hexagon
  // reaches this far up at that horizontal distance from the centre.
  return dy <= radius - (dx * radius) / (2 * half);
}

// The hexagon as a list of axis-aligned boxes to fill, top to bottom: the two
// caps as one-pixel rows and the middle band as a single box. Rounded to whole
// pixels, because that is what the canvas draws in.
//
// The row count is bounded by the cell size - a 16px hexagon costs nine boxes,
// not ninety - so a whole board stays in the low hundreds of calls.
export function hexSpans(centerX, centerY, radius) {
  const spans = [];
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.max(1, Math.round(radius));
  const half = hexHalfWidth(r);
  const quarter = r / 2;

  // Top cap: rows from the apex down to where the hexagon reaches full width.
  const capTop = Math.round(cy - r);
  const bandTop = Math.round(cy - quarter);
  for (let y = capTop; y < bandTop; y++) {
    // How far down the cap this row is, as a fraction; the width grows linearly.
    const t = (y + 1 - (cy - r)) / (r - quarter);
    const w = Math.round(half * Math.min(1, Math.max(0, t)));
    if (w > 0) {
      spans.push({ x1: cx - w, y1: y, x2: cx + w, y2: y + 1 });
    }
  }

  // The middle band, at full width, in one box.
  const bandBottom = Math.round(cy + quarter);
  const wHalf = Math.round(half);
  spans.push({ x1: cx - wHalf, y1: bandTop, x2: cx + wHalf, y2: bandBottom });

  // Bottom cap, mirroring the top.
  const capBottom = Math.round(cy + r);
  for (let y = bandBottom; y < capBottom; y++) {
    const t = (cy + r - y) / (r - quarter);
    const w = Math.round(half * Math.min(1, Math.max(0, t)));
    if (w > 0) {
      spans.push({ x1: cx - w, y1: y, x2: cx + w, y2: y + 1 });
    }
  }

  return spans;
}

// Which cell a tap landed in, or -1 for a tap off the board.
//
// The cell centres form a hex lattice, and the region of the plane closest to a
// lattice point IS that point's hexagon - so "nearest centre" is not an
// approximation here, it is the exact answer. The cutoff keeps taps in the caps
// above and below the board from being dragged onto an edge cell.
export function cellAt(layout, x, y) {
  let best = -1;
  let bestDistance = Infinity;
  for (let cell = 0; cell < layout.cellCount; cell++) {
    const dx = x - layout.centersX[cell];
    const dy = y - layout.centersY[cell];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }
  // Anything further from its centre than a whole cell is off the board: the
  // lattice only tiles the rhombus, so beyond its border there is nothing to hit.
  const reach = layout.scale;
  return bestDistance <= reach * reach ? best : -1;
}
