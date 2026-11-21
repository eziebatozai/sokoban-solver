// Sokoban solver: push-optimal A* room by room, stitched with hallway walks.
//
// The generator's levels are a one-wide hallway with one to four small rooms
// off it. A box pushed out of a room into the hallway can never come back, so
// every box stays in its room and the push-optimal total is the sum of the
// rooms' optima. This solver finds each room, solves it push-optimally on its
// own (A* over pushes, boxes plus the player's reachable region as the state,
// a min-assignment heuristic, dead-square and frozen-block pruning), then
// stitches the rooms together with plain walks along the hallway. Walking is
// free: only pushes are scored.
//
// Deterministic by construction: fixed direction order, fixed tie-breaks, and
// a work budget (states created) instead of the clock. The same input always
// gives the same output.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Directions: [dx, dy, walk letter, push letter]. Fixed order, everywhere. */
const DIRS: [number, number, string, string][] = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

/** A level in XSB text: its width, walls, goals, boxes and player. */
function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  // The outermost frame is wall whatever it shows: nothing leaves the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/**
 * The squares from which a box alone can be pushed onto some goal, pulled
 * back from the goals over open floor: a square y is live when some live
 * square x sits one push beyond it (x = y + d) with the player able to stand
 * behind the box (y - d open). A box off a live square is dead, so any state
 * holding one can be pruned without losing a solution.
 */
function liveSquares(w: number, wall: Uint8Array, goals: number[]): Uint8Array {
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const y = x - d;
      if (!wall[y] && !wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/**
 * The player's reachable region from `from` (walls and `occupied` boxes in
 * the way), marked in `seen` with `stamp`; returns its lowest square, which
 * names the region. The region stays marked under that stamp afterwards, so a
 * caller can test whether a square lies in it.
 */
function regionLow(
  w: number,
  wall: Uint8Array,
  occupied: Uint8Array,
  from: number,
  seen: Int32Array,
  stamp: number,
  stack: Int32Array,
): number {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    const q0 = p - w;
    if (wall[q0] === 0 && occupied[q0] === 0 && seen[q0] !== stamp) {
      seen[q0] = stamp;
      stack[n++] = q0;
    }
    const q1 = p + w;
    if (wall[q1] === 0 && occupied[q1] === 0 && seen[q1] !== stamp) {
      seen[q1] = stamp;
      stack[n++] = q1;
    }
    const q2 = p - 1;
    if (wall[q2] === 0 && occupied[q2] === 0 && seen[q2] !== stamp) {
      seen[q2] = stamp;
      stack[n++] = q2;
    }
    const q3 = p + 1;
    if (wall[q3] === 0 && occupied[q3] === 0 && seen[q3] !== stamp) {
      seen[q3] = stamp;
      stack[n++] = q3;
    }
  }
  return low;
}

/** Whether the box just pushed to `t` sits in a frozen 2 x 2 block of walls and boxes with a box off its goal. */
function frozenBlock(w: number, wall: Uint8Array, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b]) || !(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower LURD letters (the first direction first on ties). */
function walkTo(w: number, wall: Uint8Array, occupied: Uint8Array, from: number, to: number): string {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array<string>(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * w + dx;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: the push square is out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/** BFS distances from each goal over open floor (walls only): dists[g][s]. */
function goalDistances(w: number, wall: Uint8Array, goals: number[]): Int32Array[] {
  return goals.map((g) => {
    const dist = new Int32Array(wall.length).fill(-1);
    const queue = [g];
    dist[g] = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      for (const [dx, dy] of DIRS) {
        const q = p + dy * w + dx;
        if (!wall[q] && dist[q] < 0) {
          dist[q] = dist[p] + 1;
          queue.push(q);
        }
      }
    }
    return dist;
  });
}

/**
 * The cheapest way to match every box to a distinct goal, by BFS distance:
 * the minimum over assignments of the summed distances. One push moves one
 * box one square, so this sum drops by at most one a push, and it is zero
 * exactly when every box stands on a goal: an admissible, consistent
 * heuristic for push-optimal search. Infinity when no assignment exists,
 * which prunes the state as unsolvable.
 */
function assignmentCost(boxes: number[], dists: Int32Array[]): number {
  const n = boxes.length;
  const used = new Array<boolean>(n).fill(false);
  let best = Infinity;
  const dfs = (i: number, cost: number): void => {
    if (cost >= best) return;
    if (i === n) {
      best = cost;
      return;
    }
    for (let g = 0; g < n; g++) {
      if (used[g]) continue;
      const d = dists[g][boxes[i]];
      if (d < 0) continue;
      used[g] = true;
      dfs(i + 1, cost + d);
      used[g] = false;
    }
  };
  dfs(0, 0);
  return best;
}

/** A state's key: the region's lowest square and the boxes' squares. */
function keyOf(boxes: number[], low: number, size: number): number {
  let k = low;
  for (const b of boxes) k = k * size + b;
  return k;
}

interface PushSolution {
  pushes: number;
  moves: string;
}

/**
 * A push-optimal solution of `level` by A* over pushes, or the best a greedy
 * search finds when `greedy` is set: {pushes, moves} (moves in LURD, a lower
 * letter a step, an upper one a push), or null when the search gives up
 * (or the level has no solution). A state is the boxes' squares and the
 * player's reachable region (named by its lowest square); the search expands
 * states in order of pushes made plus the assignment heuristic, so the first
 * solved state it pops is push-optimal. It prunes two deadlocks a box can
 * never leave: a dead square (one from which no push, ignoring the other
 * boxes, brings a box to any goal) and a frozen 2 x 2 block. Neither prunes
 * a solvable state, so the optimum stands. The budget is work, never the
 * clock: at most `maxStates` states kept.
 */
function solvePushes(level: Level, maxStates: number, greedy: boolean): PushSolution | null {
  const { w, wall, goals, boxes: startBoxes, player: startPlayer } = level;
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(w, wall, goals);
  const dists = goalDistances(w, wall, goals);
  const solved = (bs: number[]): boolean => bs.every((b) => goal[b]);
  if (startBoxes.some((b) => !live[b])) return null;
  if (solved(startBoxes)) return { pushes: 0, moves: '' };

  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  // The states, in creation order: their boxes, the player's square after
  // the push that made them, the pushes made, their parent, and that push.
  const sBoxes: number[][] = [startBoxes.slice()];
  const sPlayer: number[] = [startPlayer];
  const sG: number[] = [0];
  const sParent: number[] = [-1];
  const sFrom: number[] = [-1];
  const sTo: number[] = [-1];
  const sKey: number[] = [];
  const best = new Map<number, number>();

  for (const b of startBoxes) occupied[b] = 1;
  const startLow = regionLow(w, wall, occupied, startPlayer, seen, ++stamp, stack);
  for (const b of startBoxes) occupied[b] = 0;
  const startKey = keyOf(startBoxes, startLow, size);
  sKey.push(startKey);
  best.set(startKey, 0);

  // A binary heap on [f, g, state]: lowest f first; on ties the deeper g
  // first, then the earlier state. Deterministic.
  const heap: [number, number, number][] = [];
  const less = (a: [number, number, number], b: [number, number, number]): boolean =>
    a[0] < b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] < b[2])));
  const heapPush = (e: [number, number, number]): void => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      const tmp = heap[i];
      heap[i] = heap[p];
      heap[p] = tmp;
      i = p;
    }
  };
  const heapPop = (): [number, number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        const tmp = heap[i];
        heap[i] = heap[c];
        heap[c] = tmp;
        i = c;
      }
    }
    return top;
  };

  const h0 = assignmentCost(startBoxes, dists);
  if (h0 === Infinity) return null;
  heapPush([h0, 0, 0]);

  const reconstruct = (s: number): PushSolution => {
    const path: number[] = [];
    for (let t = s; t > 0; t = sParent[t]) path.push(t);
    path.reverse();
    let moves = '';
    let player = startPlayer;
    let boxes = startBoxes.slice();
    for (const t of path) {
      const from = sFrom[t];
      const to = sTo[t];
      const d = to - from;
      const dir = DIRS.find(([dx, dy]) => dy * w + dx === d)!;
      for (const b of boxes) occupied[b] = 1;
      moves += walkTo(w, wall, occupied, player, from - d);
      for (const b of boxes) occupied[b] = 0;
      moves += dir[3];
      player = from;
      const i = boxes.indexOf(from);
      boxes[i] = to;
      boxes.sort((a, b) => a - b);
    }
    return { pushes: sG[s], moves };
  };

  while (heap.length > 0) {
    if (sBoxes.length >= maxStates) return null;
    const [, g, s] = heapPop();
    if (best.get(sKey[s]) !== g) continue; // stale: a better path to this state exists
    const bs = sBoxes[s];
    if (solved(bs)) return reconstruct(s);
    for (const b of bs) occupied[b] = 1;
    const here = ++stamp;
    regionLow(w, wall, occupied, sPlayer[s], seen, here, stack);
    for (let bi = 0; bi < bs.length; bi++) {
      const b = bs[bi];
      for (const [dx, dy] of DIRS) {
        const d = dy * w + dx;
        const t = b + d;
        const behind = b - d;
        if (seen[behind] !== here) continue; // the player cannot reach the pushing square
        if (wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        if (frozenBlock(w, wall, occupied, goal, t)) {
          occupied[t] = 0;
          occupied[b] = 1;
          continue;
        }
        const next = bs.slice();
        next[bi] = t;
        next.sort((a, b2) => a - b2);
        const low = regionLow(w, wall, occupied, b, mark, ++stamp, stack);
        const key = keyOf(next, low, size);
        const g2 = g + 1;
        const prev = best.get(key);
        if (prev !== undefined && prev <= g2) {
          occupied[t] = 0;
          occupied[b] = 1;
          continue;
        }
        const h = assignmentCost(next, dists);
        if (h === Infinity) {
          occupied[t] = 0;
          occupied[b] = 1;
          continue;
        }
        best.set(key, g2);
        const idx = sBoxes.length;
        sBoxes.push(next);
        sPlayer.push(b);
        sG.push(g2);
        sParent.push(s);
        sFrom.push(b);
        sTo.push(t);
        sKey.push(key);
        heapPush([greedy ? h : g2 + h, g2, idx]);
        occupied[t] = 0;
        occupied[b] = 1;
      }
    }
    for (const b of bs) occupied[b] = 0;
  }
  return null;
}

/** The square the player stands on after `moves` (LURD, the case aside) from `from` on a board `w` wide. */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves) {
    const c = ch.toLowerCase();
    p += c === 'u' ? -w : c === 'd' ? w : c === 'l' ? -1 : 1;
  }
  return p;
}

/** The most states one search keeps before it gives up: work, never the clock. */
const MAX_STATES = 250_000;

interface Room {
  squares: number[];
  boxes: number[];
  goals: number[];
  done: boolean;
}

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway:
 * a box there reaches no goal) out of the floor, and each part left that
 * holds a box is a room, its squares, boxes and goals. Null when some part
 * holds more or fewer boxes than goals, or a box starts in the hallway:
 * then the level is no set of rooms.
 */
function roomsOf(level: Level): Room[] | null {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(w, wall, goals);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i] + dy * w + dx;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [], done: false });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/**
 * The level solved room by room: each room's push-optimal solution in turn,
 * the other rooms' boxes standing as walls (on their goals once their room
 * is done), the player walking on from where the last room left it. A box
 * never leaves its room (a push through a door lands it in the hallway,
 * where it reaches no goal), so the rooms' optima add up to the level's.
 * When the optimal search gives up on a room, a greedy search tries for any
 * solution: a solved level a few pushes over still scores, an unsolved one
 * scores 0.
 */
function solveByRooms(level: Level): PushSolution | null {
  const rooms = roomsOf(level);
  if (rooms === null) return solvePushes(level, MAX_STATES, false);
  let player = level.player;
  let pushes = 0;
  let moves = '';
  for (const room of rooms) {
    const wall = level.wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
    }
    const sub: Level = {
      w: level.w,
      h: level.h,
      wall,
      goals: room.goals.slice().sort((a, b) => a - b),
      boxes: room.boxes.slice().sort((a, b) => a - b),
      player,
    };
    let solved = solvePushes(sub, MAX_STATES, false);
    if (solved === null) solved = solvePushes(sub, MAX_STATES, true);
    if (solved === null) return null;
    pushes += solved.pushes;
    moves += solved.moves;
    player = endOf(level.w, player, solved.moves);
    room.done = true;
  }
  return { pushes, moves };
}

/** The moves solving a level's text, or '' when no solution is found. */
function solveLevel(text: string): string {
  const level = parseLevel(text);
  const solved = solveByRooms(level);
  return solved === null ? '' : solved.moves;
}

for (const id of readdirSync(I).sort()) {
  let moves = '';
  try {
    moves = solveLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  } catch {
    moves = ''; // an empty answer is valid; a bad instance must not sink the set
  }
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
