import { describe, it, expect } from 'vitest';
import {
  createGame, move, undo, movesAvailable, spawn,
  serialize, deserialize, fromValues, toValues, SIZE
} from './game';

// Deterministic rng: always picks the first empty cell and value 2.
const rngZero = () => 0;

describe('createGame', () => {
  it('starts with two tiles', () => {
    expect(createGame(rngZero).tiles.length).toBe(2);
  });
});

describe('move - sliding', () => {
  it('slides tiles to the edge', () => {
    const s = fromValues([
      0, 0, 0, 2,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'left', rngZero);
    expect(next.tiles.find((t) => t.value === 2 && t.col === 0)).toBeTruthy();
  });

  it('merges a pair once', () => {
    const s = fromValues([
      2, 2, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'left', rngZero);
    expect(next.tiles.some((t) => t.value === 4)).toBe(true);
    expect(next.score).toBe(4);
  });

  it('does not double-merge in one move ([2,2,4] -> [4,4], not [8])', () => {
    const s = fromValues([
      2, 2, 4, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'left', rngZero);
    const row0 = toValues(next.tiles).slice(0, 4);
    expect(row0.slice(0, 2)).toEqual([4, 4]);
  });

  it('handles [4,2,2] left as [4,4]', () => {
    const s = fromValues([
      4, 2, 2, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'left', rngZero);
    expect(toValues(next.tiles).slice(0, 2)).toEqual([4, 4]);
    expect(next.score).toBe(4);
  });

  it('merges vertically', () => {
    const s = fromValues([
      2, 0, 0, 0,
      2, 0, 0, 0,
      4, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'up', rngZero);
    const col0 = [0, 4, 8, 12].map((i) => toValues(next.tiles)[i]);
    expect(col0.slice(0, 2)).toEqual([4, 4]);
  });

  it('merges right with correct edge order', () => {
    const s = fromValues([
      2, 2, 2, 2,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'right', rngZero);
    const row0 = toValues(next.tiles).slice(0, 4);
    expect(row0[2]).toBe(4);
    expect(row0[3]).toBe(4);
  });

  it('spawns exactly one new tile after a successful move', () => {
    const s = fromValues([
      2, 2, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    expect(move(s, 'left', rngZero).tiles.length).toBe(2);
  });

  it('returns the same state when nothing moves', () => {
    const s = fromValues([
      2, 0, 0, 0,
      4, 0, 0, 0,
      8, 0, 0, 0,
      16, 0, 0, 0
    ]);
    expect(move(s, 'left', rngZero)).toBe(s);
  });

  it('does nothing when the game is over', () => {
    const s = fromValues([
      2, 2, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    s.over = true;
    expect(move(s, 'left', rngZero)).toBe(s);
  });
});

describe('win and game over', () => {
  it('flags won when a 2048 tile is created', () => {
    const s = fromValues([
      1024, 1024, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    expect(move(s, 'left', rngZero).won).toBe(true);
  });

  it('detects a full board with no merges as over', () => {
    const full = fromValues([
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 4, 2
    ]);
    expect(movesAvailable(full.tiles)).toBe(false);
  });

  it('a full board with one merge available is not over', () => {
    const full = fromValues([
      2, 4, 2, 4,
      4, 2, 4, 2,
      2, 4, 2, 4,
      4, 2, 4, 4
    ]);
    expect(movesAvailable(full.tiles)).toBe(true);
  });
});

describe('undo', () => {
  it('restores tiles and score from before the move', () => {
    const s = fromValues([
      2, 2, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);
    const next = move(s, 'left', rngZero);
    const back = undo(next);
    expect(back.score).toBe(0);
    expect(back.tiles.length).toBe(2);
    expect(back.tiles.every((t) => t.value === 2)).toBe(true);
  });

  it('is a no-op with empty history', () => {
    const s = createGame(rngZero);
    expect(undo(s)).toBe(s);
  });
});

describe('persistence', () => {
  it('round-trips a game', () => {
    const s = move(createGame(rngZero), 'left', rngZero);
    const loaded = deserialize(serialize(s, 128));
    expect(loaded.best).toBe(128);
    expect(toValues(loaded.state.tiles)).toEqual(toValues(s.tiles));
    expect(loaded.state.score).toBe(s.score);
  });

  it('rejects corrupt data', () => {
    expect(deserialize('junk')).toBeNull();
    expect(deserialize('{"version":1}')).toBeNull();
    expect(deserialize(null)).toBeNull();
  });

  it('future spawns do not collide with restored ids', () => {
    const s = createGame(rngZero);
    const loaded = deserialize(serialize(s, 0));
    const maxId = Math.max(...loaded.state.tiles.map((t) => t.id));
    spawn(loaded.state, rngZero);
    expect(Math.max(...loaded.state.tiles.map((t) => t.id))).toBeGreaterThan(maxId);
  });
});
