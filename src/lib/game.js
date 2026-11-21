// 2048 game logic. Pure state transitions - the React layer renders `tiles`
// as absolutely positioned elements keyed by tile id, which is what makes the
// slide animations possible.

export const SIZE = 4;

let nextId = 1;

export function createGame(rng = Math.random) {
  const state = {
    tiles: [],
    score: 0,
    over: false,
    won: false,
    keepPlaying: false,
    history: []
  };
  spawn(state, rng);
  spawn(state, rng);
  return state;
}

// grid[16] of tile-or-null, row-major.
function gridOf(tiles) {
  const grid = new Array(SIZE * SIZE).fill(null);
  for (const t of tiles) grid[t.row * SIZE + t.col] = t;
  return grid;
}

export function spawn(state, rng = Math.random) {
  const taken = new Set(state.tiles.map((t) => t.row * SIZE + t.col));
  const empty = [];
  for (let i = 0; i < SIZE * SIZE; i += 1) if (!taken.has(i)) empty.push(i);
  if (empty.length === 0) return false;
  const cell = empty[Math.floor(rng() * empty.length)];
  state.tiles.push({
    id: nextId++,
    value: rng() < 0.9 ? 2 : 4,
    row: Math.floor(cell / SIZE),
    col: cell % SIZE,
    justSpawned: true,
    justMerged: false
  });
  return true;
}

const VECTORS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 }
};

function snapshot(state) {
  return {
    tiles: state.tiles.map((t) => ({ ...t })),
    score: state.score,
    over: state.over,
    won: state.won
  };
}

// Returns a new state. If the move changes nothing, returns the same object.
export function move(state, direction, rng = Math.random) {
  const vector = VECTORS[direction];
  if (!vector || state.over) return state;

  const next = snapshot(state);
  next.keepPlaying = state.keepPlaying;
  next.history = state.history;
  const grid = gridOf(next.tiles);

  const { dr, dc } = vector;
  // Traverse from the edge the tiles move toward, so front tiles settle first.
  const rows = dr === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const cols = dc === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];

  let moved = false;
  let gained = 0;
  const mergedThisTurn = new Set();

  for (const row of rows) {
    for (const col of cols) {
      const tile = grid[row * SIZE + col];
      if (!tile) continue;

      // Find the farthest empty cell, and the cell just past it.
      let r = row;
      let c = col;
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !grid[nr * SIZE + nc]) {
        r = nr;
        c = nc;
        nr = r + dr;
        nc = c + dc;
      }

      const target =
        nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE ? grid[nr * SIZE + nc] : null;

      if (target && target.value === tile.value && !mergedThisTurn.has(target.id)) {
        // Merge: both tiles slide to the target cell; the target absorbs them.
        grid[row * SIZE + col] = null;
        grid[nr * SIZE + nc] = target;
        tile.row = nr;
        tile.col = nc;
        tile.consumed = true; // kept for one render so the slide shows
        target.value *= 2;
        target.justMerged = true;
        mergedThisTurn.add(target.id);
        gained += target.value;
        moved = true;
      } else if (r !== row || c !== col) {
        grid[row * SIZE + col] = null;
        grid[r * SIZE + c] = tile;
        tile.row = r;
        tile.col = c;
        moved = true;
      }
    }
  }

  if (!moved) return state;

  next.score += gained;
  // Drop consumed tiles; clear one-frame flags on the rest.
  next.tiles = next.tiles.filter((t) => !t.consumed);
  for (const t of next.tiles) {
    t.justSpawned = false;
  }

  next.history = [...state.history.slice(-19), snapshot(state)];
  spawn(next, rng);

  if (!next.won && next.tiles.some((t) => t.value >= 2048)) next.won = true;
  next.over = !movesAvailable(next.tiles);
  return next;
}

export function movesAvailable(tiles) {
  const grid = gridOf(tiles);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    if (!grid[i]) return true;
    const row = Math.floor(i / SIZE);
    const col = i % SIZE;
    const right = col < SIZE - 1 ? grid[i + 1] : null;
    const down = row < SIZE - 1 ? grid[i + SIZE] : null;
    if ((right && right.value === grid[i].value) || (down && down.value === grid[i].value)) {
      return true;
    }
  }
  return false;
}

export function undo(state) {
  if (state.history.length === 0) return state;
  const prev = state.history[state.history.length - 1];
  return {
    ...prev,
    tiles: prev.tiles.map((t) => ({ ...t, justSpawned: false, justMerged: false })),
    keepPlaying: state.keepPlaying,
    history: state.history.slice(0, -1)
  };
}

// --- persistence ---
export const STORAGE_KEY = 'game-2048-v1';

export function serialize(state, best) {
  return JSON.stringify({
    version: 1,
    best,
    tiles: state.tiles.map(({ id, value, row, col }) => ({ id, value, row, col })),
    score: state.score,
    over: state.over,
    won: state.won,
    keepPlaying: state.keepPlaying
  });
}

export function deserialize(raw) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.tiles)) return null;
    const tiles = d.tiles.filter(
      (t) => t && Number.isInteger(t.row) && Number.isInteger(t.col) && t.value > 0
    );
    if (!tiles.length) return null;
    for (const t of tiles) nextId = Math.max(nextId, t.id + 1);
    return {
      state: {
        tiles: tiles.map((t) => ({ ...t, justSpawned: false, justMerged: false })),
        score: d.score || 0,
        over: Boolean(d.over),
        won: Boolean(d.won),
        keepPlaying: Boolean(d.keepPlaying),
        history: []
      },
      best: d.best || 0
    };
  } catch {
    return null;
  }
}

// Test helper: build a state from an array of 16 values (0 = empty).
export function fromValues(values) {
  const tiles = [];
  values.forEach((value, i) => {
    if (value > 0) {
      tiles.push({
        id: nextId++,
        value,
        row: Math.floor(i / SIZE),
        col: i % SIZE,
        justSpawned: false,
        justMerged: false
      });
    }
  });
  return { tiles, score: 0, over: false, won: false, keepPlaying: false, history: [] };
}

// Test helper: 16 values row-major.
export function toValues(tiles) {
  return gridOf(tiles).map((t) => (t ? t.value : 0));
}
