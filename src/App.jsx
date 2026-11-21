import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createGame, move, undo, serialize, deserialize, STORAGE_KEY, SIZE
} from './lib/game';

const BEST_KEY = 'game-2048-best';
const GAP = 10;

function loadSaved() {
  try {
    return deserialize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export default function App() {
  const saved = useRef(loadSaved());
  const [game, setGame] = useState(() => saved.current?.state ?? createGame());
  const [best, setBest] = useState(() => {
    const b = Number(localStorage.getItem(BEST_KEY)) || 0;
    return Math.max(b, saved.current?.best ?? 0);
  });
  const [cell, setCell] = useState(80);
  const boardRef = useRef(null);
  const touchStart = useRef(null);

  // Track the rendered best score.
  useEffect(() => {
    if (game.score > best) {
      setBest(game.score);
      localStorage.setItem(BEST_KEY, String(game.score));
    }
  }, [game.score, best]);

  // Persist the game, debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, serialize(game, Math.max(best, game.score)));
    }, 200);
    return () => clearTimeout(t);
  }, [game, best]);

  // Measure the board for exact tile positions.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => setCell((el.clientWidth - GAP * (SIZE + 1)) / SIZE);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doMove = useCallback((dir) => {
    setGame((g) => move(g, dir));
  }, []);

  useEffect(() => {
    const keys = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right'
    };
    const onKey = (e) => {
      const dir = keys[e.key] || keys[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        doMove(dir);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setGame((g) => undo(g));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  const onPointerDown = (e) => {
    touchStart.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e) => {
    if (!touchStart.current) return;
    const dx = e.clientX - touchStart.current.x;
    const dy = e.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  const newGame = () => setGame(createGame());

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1>2048</h1>
          <p className="tagline">Join the tiles, reach 2048.</p>
        </div>
        <div className="scores">
          <div className="score-box">
            <span>Score</span>
            <strong>{game.score}</strong>
          </div>
          <div className="score-box">
            <span>Best</span>
            <strong>{best}</strong>
          </div>
        </div>
      </header>

      <div className="controls-row">
        <p className="hint">Arrow keys or swipe &middot; Ctrl+Z to undo</p>
        <div className="btns">
          <button className="btn ghost" onClick={() => setGame((g) => undo(g))}
            disabled={game.history.length === 0}>
            Undo
          </button>
          <button className="btn" onClick={newGame}>New game</button>
        </div>
      </div>

      <div
        className="board"
        ref={boardRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {Array.from({ length: SIZE * SIZE }, (_, i) => (
          <div
            key={i}
            className="cell"
            style={{
              left: GAP + (i % SIZE) * (cell + GAP),
              top: GAP + Math.floor(i / SIZE) * (cell + GAP),
              width: cell,
              height: cell
            }}
          />
        ))}
        {game.tiles.map((t) => (
          <div
            key={t.id}
            className={`tile v${t.value} ${t.justSpawned ? 'spawned' : ''} ${t.justMerged ? 'merged' : ''}`}
            style={{
              transform: `translate(${GAP + t.col * (cell + GAP)}px, ${GAP + t.row * (cell + GAP)}px)`,
              width: cell,
              height: cell,
              fontSize: t.value >= 1024 ? cell * 0.32 : t.value >= 128 ? cell * 0.4 : cell * 0.46
            }}
          >
            {t.value}
          </div>
        ))}

        {(game.over || (game.won && !game.keepPlaying)) && (
          <div className="overlay">
            <h2>{game.over ? 'Game over' : 'You made 2048!'}</h2>
            <p>Score: {game.score}</p>
            <div className="btns center">
              {game.won && !game.over && (
                <button className="btn ghost"
                  onClick={() => setGame((g) => ({ ...g, keepPlaying: true }))}>
                  Keep going
                </button>
              )}
              <button className="btn" onClick={newGame}>Try again</button>
            </div>
          </div>
        )}
      </div>

      <footer className="credit">A project by Sandeep Sagar</footer>
    </div>
  );
}
