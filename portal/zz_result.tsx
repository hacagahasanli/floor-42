/**
 * Dev-only visual harness for the Field Day result screen (never built: Vite's portal build only has index.html). Open
 * `/zz_result.html?case=win|loss|draw|2p|online&size=...` on `npm run dev:portal`. The match canvas is replaced by the arena poster,
 * and the numbers are the spec's sample data (b12-b16), so the screen can be compared with the mockups frame by frame.
 */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ResultScreen } from '../src/components/fieldday/screens/ResultScreen';

import type { ResultFighter } from '../src/components/fieldday/resultModel';

const q = new URLSearchParams(location.search);
const kase = q.get('case') ?? 'win';
const tally = (o: Partial<ResultFighter['tally']> = {}) => ({ jumps: 0, pushedBack: 0, rocketsTaken: 0, damageTaken: 0, ...o });
const stats = (o: Partial<ResultFighter['stats']>) => ({ damage: 0, accuracy: 0, deaths: 0, bestStreak: 0, shots: 0, ...o });
const win: [ResultFighter, ResultFighter] = [
  { character: 'hotfix', kos: 5, stats: stats({ damage: 512, accuracy: 57, deaths: 2, bestStreak: 3, shots: 30 }), tally: tally({ jumps: 41, pushedBack: 4, damageTaken: 301 }) },
  { character: 'standup', kos: 2, stats: stats({ damage: 301, accuracy: 41, deaths: 5, bestStreak: 1, shots: 25 }), tally: tally({ jumps: 12, rocketsTaken: 0, damageTaken: 300 }) },
];
const loss: [ResultFighter, ResultFighter] = [
  { character: 'hotfix', kos: 4, stats: stats({ damage: 388, accuracy: 44, deaths: 5, bestStreak: 2, shots: 30 }), tally: tally({ jumps: 52, pushedBack: 6, damageTaken: 402 }) },
  { character: 'standup', kos: 5, stats: stats({ damage: 402, accuracy: 61, deaths: 4, bestStreak: 3, shots: 25 }), tally: tally({ jumps: 20, damageTaken: 388 }) },
];
// The mockup's win has rockets taken by the rival: give the loser 3.
win[1].tally.rocketsTaken = 3;
const draw: [ResultFighter, ResultFighter] = [
  { ...win[0], kos: 3 },
  { ...win[1], kos: 3 },
];
const data = kase === 'loss' ? loss : kase === 'draw' ? draw : win;

const App = () => {
  const trap = useRef<HTMLInputElement>(null);
  const [asked, setAsked] = useState(kase === 'online-rematch');
  const online = kase.startsWith('online');
  const calls = useRef<string[]>([]);
  (window as unknown as { __calls: string[] }).__calls = calls.current;
  const log = (n: string) => () => {
    calls.current.push(n);
    if (n === 'rematch' && online) setAsked(true);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: `#6fbbe3 url(./menu-poster.webp) center / cover` }}>
      <input ref={trap} aria-label="trap" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      <ResultScreen
        mode={kase === '2p' ? 'twoPlayer' : online ? 'online' : 'solo'}
        fighters={data}
        winner={kase === 'draw' ? -1 : kase === 'loss' ? 1 : 0}
        drawLine="Dead even."
        colours={kase === '2p' ? ['#FF7A2F', '#4CB8FF'] : undefined}
        tally={kase === '2p' ? { p1: 3, p2: 2 } : undefined}
        rematchAsked={asked}
        rematchTicks={kase === '2p' ? [true, false] : undefined}
        canNextArena={!online}
        nextCharacter={online ? 'legacy' : undefined}
        onRematch={log('rematch')}
        onNextArena={log('next')}
        onChangeFighter={log('change')}
        onMenu={log('menu')}
        keyTrapRef={trap}
      />
    </div>
  );
};
createRoot(document.getElementById('root')!).render(<App />);
