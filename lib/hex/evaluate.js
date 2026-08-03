// How good a Hex position is, measured the cheap way.
//
// The yardstick is the classic Hex "two-distance": how many stones a player
// still has to place before it owns a connection the opponent cannot cut. It is
// a shortest-path computation with one twist - a cell counts as reached only
// once TWO of its neighbours have been reached, because a route that hangs on a
// single cell is a route the opponent simply takes. Links that can never be
// broken (a stone touching its own edge, or two stones of the same colour that
// are already joined) count for both at once.
//
// Setting `required` to 1 instead turns the same routine into the plain shortest
// path: how many stones until a connection at all. That is a weaker measure of
// strength, but it is exact about who is lost - a player with no path left has
// already been cut - so the two together tell the search everything it needs.
//
// Cost per call is O(cells): each cell settles once, and the 0/1 step costs let
// a double-ended queue stand in for a priority queue. Nothing is allocated; the
// caller passes buffers in and gets them back filled.

import { BLUE, BORDER_MASKS, MAX_NEIGHBORS, RED, borderSlot, opponent } from "./board.js";
import { createIntArray } from "./arrays.js";

// Farther than any real route on any board this app plays, and small enough to
// stay a plain integer everywhere it is added up.
export const UNREACHABLE = 30000;

// Returned by evaluate() for a finished position. Far above any positional
// score, so a win is never traded for one.
export const WIN_SCORE = 1000000;

// A connection that needs no more stones: the two-distance of a player who has
// already won.
export const CONNECTED = 0;

// The buffers the distance passes need. One set is enough for a whole search:
// the fields are consumed before the search recurses, so a deeper node may
// safely overwrite them.
export function createScratch(topology) {
  const cellCount = topology.cellCount;
  return {
    topology,
    hits: createIntArray(cellCount + 1),
    // Each cell is queued at most once, and a zero-cost step pushes to the front
    // while a one-cost step pushes to the back, so starting in the middle leaves
    // room for either.
    queue: createIntArray(2 * cellCount + 8),
    fields: [
      createIntArray(cellCount + 1),
      createIntArray(cellCount + 1),
      createIntArray(cellCount + 1),
      createIntArray(cellCount + 1),
    ],
  };
}

// Fill `out` with the distance from `player`'s `side` edge to every cell, and
// return the distance all the way across to the opposite edge (UNREACHABLE when
// there is no route left). `out[topology.cellCount]` holds that same crossing
// distance, so a caller that keeps the field keeps the total with it.
export function distanceField(topology, cells, player, side, required, scratch, out) {
  const cellCount = topology.cellCount;
  const neighbors = topology.neighbors;
  const degree = topology.degree;
  const edges = topology.edges;
  const hits = scratch.hits;
  const queue = scratch.queue;
  const foe = player === RED ? BLUE : RED;
  const targetMask = BORDER_MASKS[borderSlot(player, side ? 0 : 1)];

  for (let i = 0; i <= cellCount; i++) {
    out[i] = UNREACHABLE;
    hits[i] = 0;
  }

  // The queue never holds more than one entry per cell, so a window of that many
  // slots on each side of the start point can absorb every push.
  let head = cellCount + 4;
  let tail = head;

  // An edge cannot be taken, so a cell touching the source edge is supported by
  // it on its own: seed those cells as settled, one stone away if they are still
  // empty and none at all if they already hold the player's stone.
  const border = topology.borders[borderSlot(player, side)];
  for (let i = 0; i < border.length; i++) {
    const cell = border[i];
    if (cells[cell] === foe) {
      continue;
    }
    const cost = cells[cell] === player ? 0 : 1;
    hits[cell] = required;
    out[cell] = cost;
    if (cost === 0) {
      head -= 1;
      queue[head] = cell;
    } else {
      queue[tail] = cell;
      tail += 1;
    }
  }

  while (head < tail) {
    const cell = queue[head];
    head += 1;
    const distance = out[cell];

    if ((edges[cell] & targetMask) !== 0) {
      hits[cellCount] += cells[cell] === player ? 2 : 1;
      if (hits[cellCount] >= required) {
        // Cells settle in non-decreasing order, so the first crossing found is
        // the shortest one and the rest of the board cannot improve on it.
        out[cellCount] = distance;
        return distance;
      }
    }

    const base = cell * MAX_NEIGHBORS;
    const count = degree[cell];
    for (let i = 0; i < count; i++) {
      const next = neighbors[base + i];
      if (out[next] !== UNREACHABLE || cells[next] === foe) {
        continue;
      }
      hits[next] += cells[cell] === player && cells[next] === player ? 2 : 1;
      if (hits[next] >= required) {
        const cost = cells[next] === player ? 0 : 1;
        out[next] = distance + cost;
        if (cost === 0) {
          head -= 1;
          queue[head] = next;
        } else {
          queue[tail] = next;
          tail += 1;
        }
      }
    }
  }

  return UNREACHABLE;
}

function clamp(distance, cap) {
  return distance > cap ? cap : distance;
}

// How good the position is for `player`, in whole numbers: positive is winning.
// The two-distance difference leads, and the plain path difference breaks the
// ties it leaves - which is most of them on a quiet board, and all of them once
// one side is squeezed hard enough that no uncuttable route is left at all.
export function evaluate(topology, cells, player, scratch) {
  const foe = opponent(player);
  const fields = scratch.fields;

  const mine = distanceField(topology, cells, player, 0, 2, scratch, fields[0]);
  if (mine === CONNECTED) {
    return WIN_SCORE;
  }
  const theirs = distanceField(topology, cells, foe, 0, 2, scratch, fields[1]);
  if (theirs === CONNECTED) {
    return -WIN_SCORE;
  }

  const cap = 4 * topology.size;
  const safeTerm = clamp(theirs, cap) - clamp(mine, cap);
  const minePath = distanceField(topology, cells, player, 0, 1, scratch, fields[2]);
  const theirsPath = distanceField(topology, cells, foe, 0, 1, scratch, fields[3]);
  const pathTerm = clamp(theirsPath, cap) - clamp(minePath, cap);

  return safeTerm * (2 * cap + 1) + pathTerm;
}
