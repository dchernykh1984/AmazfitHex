// The computer opponent.
//
// A watch has no cycles to burn, so the search is bounded by work rather than by
// depth: an alpha-beta over a handful of candidate moves, deepened two plies at
// a time until a fixed budget of leaf evaluations runs out, keeping the best move
// of the last iteration that finished. (Two plies and not one because the
// evaluation says nothing about whose turn it is; see chooseMove.) Everything it
// touches is a flat integer buffer allocated once per board size and reused, so a
// whole move costs no allocations at all.
//
// Three things make that budget go far:
//
//   * Candidates. Every cell is rated by how close it lies to a route either
//     player still needs (from lib/hex/evaluate.js), and only the best handful
//     are searched. Four distance passes rate the whole board at once, which is
//     cheaper than evaluating even one move per cell would be.
//   * Tactics before search. A crossing that can be finished this move, by
//     either side, is read straight off those same distance passes, so no level
//     ever has to spend search on the one move that obviously has to be played.
//   * Termination. A move that wins is recognised by a flood fill from the stone
//     just placed, not by a full evaluation, and ends that branch immediately.

import { EMPTY, MAX_NEIGHBORS, borderMask, opponent } from "./board.js";
import { canSwap } from "./game.js";
import { WIN_SCORE, createScratch, evaluate, distanceField } from "./evaluate.js";
import { createByteArray, createIntArray } from "./arrays.js";

// Beyond any score evaluate() can return, so it is safe as an opening window.
const INFINITE = WIN_SCORE * 2;

// The levels the settings screen cycles through.
//
//   depth  - plies of search; 0 means "do not search at all"
//   width  - candidate moves considered at the root
//   inner  - candidate moves considered below the root. Breadth at the root is
//            what decides how well the level plays - the rating that picks the
//            candidates is good but not good enough to trust its top eight - so
//            the tree is kept affordable by narrowing with depth instead.
//   effort - leaf evaluations allowed for a whole move, before the board size is
//            taken into account (see nodeBudget)
export const LEVELS = [
  { id: "easy", label: "level_easy", depth: 0, width: 0, inner: 0, effort: 0 },
  { id: "normal", label: "level_normal", depth: 1, width: 12, inner: 12, effort: 1600 },
  { id: "hard", label: "level_hard", depth: 3, width: 12, inner: 8, effort: 90000 },
];

export const DEFAULT_LEVEL = 1;

const MAX_DEPTH = LEVELS.reduce((most, level) => Math.max(most, level.depth), 0);
const MAX_WIDTH = LEVELS.reduce((most, level) => Math.max(most, level.width, level.inner), 1);

// Clamp a stored or user-supplied level into the range of LEVELS. Nothing at all
// is checked before the numeric coercion, because Number(null) and Number("")
// are both 0 - a fresh install would otherwise start on the easiest level
// instead of the default one.
export function clampLevel(level) {
  if (level === null || level === undefined || level === "") {
    return DEFAULT_LEVEL;
  }
  const index = Math.floor(Number(level));
  if (!Number.isFinite(index) || index < 0 || index >= LEVELS.length) {
    return DEFAULT_LEVEL;
  }
  return index;
}

// The next level in the cycle, so one button can walk through all of them.
export function nextLevel(level) {
  return (clampLevel(level) + 1) % LEVELS.length;
}

// A leaf evaluation costs a handful of passes over the board, so the number of
// leaves a level may look at is its effort divided by the board area: a big
// board then costs the watch about the same wall clock as a small one.
export function nodeBudget(level, cellCount) {
  const config = LEVELS[clampLevel(level)];
  if (config.depth === 0) {
    return 0;
  }
  const cells = Math.max(1, Math.floor(cellCount));
  return Math.max(config.width, Math.round(config.effort / cells));
}

// Every buffer a search needs, sized for one board. Built by contextFor() and
// reused for as long as the board size stays the same.
export function createContext(topology) {
  const context = createScratch(topology);
  context.board = createByteArray(topology.cellCount);
  context.mark = createIntArray(topology.cellCount);
  context.generation = 0;
  context.keys = createIntArray(MAX_WIDTH);
  context.empties = createIntArray(topology.cellCount);
  context.moveLists = [];
  for (let depth = 0; depth <= MAX_DEPTH; depth++) {
    context.moveLists.push(createIntArray(MAX_WIDTH));
  }
  context.nodes = 0;
  context.nodeLimit = 0;
  context.width = 1;
  context.innerWidth = 1;
  context.aborted = false;
  return context;
}

let cached = null;

function contextFor(topology) {
  if (cached === null || cached.topology !== topology) {
    cached = createContext(topology);
  }
  return cached;
}

// Whether the stone just placed on `cell` completed a crossing chain for
// `color`. Only the group the new stone belongs to can have changed, so this
// walks that group alone rather than the whole board.
function connects(context, cells, color, cell) {
  const topology = context.topology;
  const startMask = borderMask(color, 0);
  const endMask = borderMask(color, 1);
  const mark = context.mark;
  const queue = context.queue;
  context.generation += 1;
  const stamp = context.generation;

  let head = 0;
  let tail = 0;
  queue[tail] = cell;
  tail += 1;
  mark[cell] = stamp;
  let seen = topology.edges[cell];

  while (head < tail) {
    const current = queue[head];
    head += 1;
    const base = current * MAX_NEIGHBORS;
    const count = topology.degree[current];
    for (let i = 0; i < count; i++) {
      const next = topology.neighbors[base + i];
      if (mark[next] === stamp || cells[next] !== color) {
        continue;
      }
      mark[next] = stamp;
      seen |= topology.edges[next];
      queue[tail] = next;
      tail += 1;
    }
  }

  return (seen & startMask) !== 0 && (seen & endMask) !== 0;
}

function clamp(distance, cap) {
  return distance > cap ? cap : distance;
}

// Keep the `width` lowest-keyed cells seen so far, sorted, by insertion. Width
// is a handful, so this beats sorting the whole board.
function insert(moves, keys, count, width, cell, key) {
  if (count === width && key >= keys[count - 1]) {
    return count;
  }
  let position = count < width ? count : width - 1;
  while (position > 0 && keys[position - 1] > key) {
    keys[position] = keys[position - 1];
    moves[position] = moves[position - 1];
    position -= 1;
  }
  keys[position] = key;
  moves[position] = cell;
  return count < width ? count + 1 : count;
}

// Fill `moves` with the most promising empty cells, best first, and return how
// many there are.
//
// A cell is rated by how long a crossing that runs through it would be, for both
// players at once: the distance from one edge to the cell plus the distance from
// the cell to the other edge, summed over the two players. The cells both sides
// still need are the cells Hex is decided on, and ties go to the more central
// one.
//
// The rating deliberately uses the plain shortest path rather than the
// two-distance the evaluation is built on. Two-distance answers a coarser
// question and leaves most of the board on the same plateau, which is fine for
// judging a position but no use for telling two moves apart; scoring the
// candidates by the sharper measure was worth more here than another ply of
// search.
export function orderMoves(context, cells, player, moves, width) {
  const topology = context.topology;
  const cellCount = topology.cellCount;
  const fields = context.fields;
  const foe = opponent(player);

  distanceField(topology, cells, player, 0, 1, context, fields[0]);
  distanceField(topology, cells, player, 1, 1, context, fields[1]);
  distanceField(topology, cells, foe, 0, 1, context, fields[2]);
  distanceField(topology, cells, foe, 1, 1, context, fields[3]);

  const cap = 4 * topology.size;
  const bias = topology.centerBias;
  const keys = context.keys;
  const limit = width < 1 ? 1 : width > MAX_WIDTH ? MAX_WIDTH : width;
  let count = 0;

  for (let cell = 0; cell < cellCount; cell++) {
    if (cells[cell] !== EMPTY) {
      continue;
    }
    const mine = clamp(fields[0][cell], cap) + clamp(fields[1][cell], cap);
    const theirs = clamp(fields[2][cell], cap) + clamp(fields[3][cell], cap);
    // centerBias is always below 4 * size, so it decides the order only between
    // cells whose routes are equally long.
    const key = (mine + theirs) * (4 * topology.size) + bias[cell];
    count = insert(moves, keys, count, limit, cell, key);
  }

  return count;
}

// Alpha-beta, scored from the point of view of whoever is to move. `ply` counts
// up from the root, and a win is worth that much less for every ply it took to
// reach, so of two winning lines the shorter one is preferred.
function negamax(context, cells, toMove, depth, ply, alpha, beta) {
  if (depth <= 0) {
    context.nodes += 1;
    return evaluate(context.topology, cells, toMove, context);
  }

  const moves = context.moveLists[ply];
  const count = orderMoves(context, cells, toMove, moves, context.innerWidth);
  if (count === 0) {
    context.nodes += 1;
    return evaluate(context.topology, cells, toMove, context);
  }

  const foe = opponent(toMove);
  // `best` is what this node will report; `lower` is the best either this node
  // or an ancestor has already secured, which is what the children are searched
  // against. They part company only until the first move comes back.
  let best = -INFINITE;
  let lower = alpha;

  for (let i = 0; i < count; i++) {
    const move = moves[i];
    cells[move] = toMove;
    let value;
    if (connects(context, cells, toMove, move)) {
      value = WIN_SCORE - ply;
    } else {
      value = -negamax(context, cells, foe, depth - 1, ply + 1, -beta, -lower);
    }
    cells[move] = EMPTY;

    if (value > best) {
      best = value;
    }
    if (best > lower) {
      lower = best;
    }
    // The opponent already has a reply it prefers to anything this node can now
    // promise, so the rest of the move list will never be reached.
    if (lower >= beta) {
      break;
    }
    // Out of budget with moves still unexamined: this node now reports less than
    // it is worth, so the iteration it belongs to is thrown away.
    if (context.nodes >= context.nodeLimit && i + 1 < count) {
      context.aborted = true;
      break;
    }
  }

  return best;
}

// One full-width iteration from the root. `preferred` is the best move of the
// previous, shallower iteration; searching it first makes the window tight
// straight away, which is most of what alpha-beta pruning lives on.
function searchRoot(context, cells, toMove, depth, preferred) {
  const moves = context.moveLists[0];
  const count = orderMoves(context, cells, toMove, moves, context.width);
  if (count === 0) {
    return { move: -1, score: 0 };
  }

  for (let i = 1; i < count; i++) {
    if (moves[i] === preferred) {
      moves[i] = moves[0];
      moves[0] = preferred;
      break;
    }
  }

  const foe = opponent(toMove);
  let bestMove = moves[0];
  let bestScore = -INFINITE;

  for (let i = 0; i < count; i++) {
    const move = moves[i];
    cells[move] = toMove;
    let value;
    if (connects(context, cells, toMove, move)) {
      value = WIN_SCORE;
    } else {
      value = -negamax(context, cells, foe, depth - 1, 1, -INFINITE, -bestScore);
    }
    cells[move] = EMPTY;

    if (value > bestScore) {
      bestScore = value;
      bestMove = move;
    }
    if (bestScore >= WIN_SCORE) {
      break;
    }
    if (context.nodes >= context.nodeLimit && i + 1 < count) {
      context.aborted = true;
      break;
    }
  }

  return { move: bestMove, score: bestScore };
}

// The cells where one stone would finish `player`'s crossing outright, counted;
// the first of them is left in context.threatCell.
//
// A stone on cell c joins the near edge when the shortest route from that edge
// to c is one stone long - c itself - and joins the far edge on the same terms,
// so the two plain distance fields answer the question for the whole board at
// once. No stones are placed and nothing is flood filled.
function countImmediateWins(context, cells, player) {
  const topology = context.topology;
  const start = context.fields[0];
  const end = context.fields[1];
  distanceField(topology, cells, player, 0, 1, context, start);
  distanceField(topology, cells, player, 1, 1, context, end);

  let count = 0;
  context.threatCell = -1;
  for (let cell = 0; cell < topology.cellCount; cell++) {
    if (cells[cell] === EMPTY && start[cell] === 1 && end[cell] === 1) {
      if (count === 0) {
        context.threatCell = cell;
      }
      count += 1;
    }
  }
  return count;
}

// A stone dropped anywhere at all. The easiest level plays this once it has been
// offered the winning move it never misses, which leaves it a legal opponent
// that a beginner can beat.
function randomMove(context, cells, random) {
  const cellCount = context.topology.cellCount;
  const empties = context.empties;
  let count = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    if (cells[cell] === EMPTY) {
      empties[count] = cell;
      count += 1;
    }
  }
  if (count === 0) {
    return -1;
  }
  const pick = Math.floor(random() * count);
  if (!Number.isFinite(pick) || pick < 0) {
    return empties[0];
  }
  return empties[pick >= count ? count - 1 : pick];
}

// The cell the computer plays, or -1 when there is nothing to play. The game is
// never touched: the search runs on a copy of the board.
export function chooseMove(game, options) {
  const config = options || {};
  const random = typeof config.random === "function" ? config.random : Math.random;
  const level = clampLevel(config.level);
  const settings = LEVELS[level];

  if (game.winner !== EMPTY) {
    return -1;
  }

  const context = contextFor(game.topology);
  const cells = context.board;
  const cellCount = game.topology.cellCount;
  for (let cell = 0; cell < cellCount; cell++) {
    cells[cell] = game.cells[cell];
  }

  // A crossing that can be finished now is finished now, at every level.
  if (countImmediateWins(context, cells, game.turn) > 0) {
    return context.threatCell;
  }

  if (settings.depth === 0) {
    return randomMove(context, cells, random);
  }

  // Otherwise, if the opponent can finish next move and exactly one cell does
  // it, that cell is the only move that is not an immediate loss. Two such cells
  // and the game is already gone, so the search may as well play on.
  if (countImmediateWins(context, cells, opponent(game.turn)) === 1) {
    return context.threatCell;
  }

  context.width = settings.width;
  context.innerWidth = settings.inner;
  context.nodes = 0;
  context.nodeLimit = nodeBudget(level, cellCount);
  context.aborted = false;

  let best = -1;
  // Odd depths only. The evaluation says nothing about whose turn it is, so a
  // position judged after an even number of plies is judged with the wrong side
  // on move and reads as far better than it is; deepening two plies at a time
  // keeps every iteration comparable with the one before it.
  for (let depth = 1; depth <= settings.depth; depth += 2) {
    const result = searchRoot(context, cells, game.turn, depth, best);
    if (result.move < 0) {
      break;
    }
    // A cut-short iteration has only looked at part of the move list, so its
    // answer replaces the previous one only when there is no previous one.
    if (!context.aborted || best < 0) {
      best = result.move;
    }
    if (context.aborted || result.score >= WIN_SCORE - depth) {
      break;
    }
  }

  return best >= 0 ? best : randomMove(context, cells, random);
}

// Whether the computer takes the opening stone when the pie rule offers it. Hex
// theory says an opening near the middle is worth having and one out towards an
// acute corner is not; centerBias is four times the hex distance from the middle
// of the board, so this takes anything within half a board of it.
export function shouldSwap(game) {
  if (!canSwap(game) || game.lastMove < 0) {
    return false;
  }
  return game.topology.centerBias[game.lastMove] <= 2 * (game.size - 1);
}
