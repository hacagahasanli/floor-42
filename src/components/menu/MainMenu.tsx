'use client';

import { useEffect, useRef, useState } from 'react';

import { FighterSelect } from '~/components/fieldday/screens/FighterSelect';
import { HomeScreen } from '~/components/fieldday/screens/HomeScreen';
import { HowToScreen } from '~/components/fieldday/screens/HowToScreen';
import { useFighterPortraits } from '~/components/fieldday/Portrait';
import { Stage } from '~/components/fieldday/Stage';
import { readCharacter, saveCharacter } from '~/components/MenuShell';
import { useMenuTelemetry } from '~/components/useTelemetry';
import { useVsTo, vsTags } from '~/components/VsDoors';
import { warmDoorPortraits } from '~/components/vsPortraits';
import { ARENA_COPY } from '~/game/arenaChoice';
import { isTouchDevice } from '~/game/input';
import { deviceFacts, renderProfile } from '~/game/render/quality';
import { ROSTER } from '~/game/roster';
import { getSettings } from '~/game/settings';
import { ARENA_IDS, RULES } from '~/game/sim/constants';
import { asset, navigate, PORTAL } from '~/lib/portal';
import { GAME_VERSION, STUDIO_NAME } from '~/lib/studio';

import { TwoPlayerSelect } from '~/components/twoPlayer/TwoPlayerSelect';
import { readLength, resetTally, sessionStore, show2PMenuItem } from '~/game/twoPlayer';

import { CreditsPanel } from './Credits';
import { menuSound } from './menuSound';
import { SettingsPanel } from './SettingsPanel';
import { useGamepadNav } from './useGamepadNav';
import { useSettings } from './useSettings';

import { readFinishedMatch } from '~/game/firstMatch';
import type { BotLevel } from '~/game/sim/bot';
import type { ArenaId } from '~/game/sim/constants';
import type { CharacterId } from '~/game/sim/types';
import type { MatchLength } from '~/game/twoPlayer';

/**
 * The first screen, in the Field Day skin (Direction B, spec docs/collab/CREATIVE/ui/direction-b/spec.md): the live OFFSITE
 * backdrop with the fighter hidden, and over it the home (b02), the 1-player fighter select (b03) or the 2-player select (b04),
 * all drawn by src/components/fieldday. This component owns the state: the picked fighter, the arena, the bot level, the
 * screen, and the start of a match (VS doors). How to play, Credits and Settings are Field Day modal screens (phase 2a).
 * Keyboard: arrows move (by geometry), Enter picks, Esc goes back. Gamepads drive the same keys (useGamepadNav).
 */

type Screen = 'main' | 'select' | 'howto' | 'credits' | '2p';

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

/** The fighter select's own URL on the site. */
const SELECT_PATH = '/characters';

const nextInRoster = (id: CharacterId) => ROSTER[(ROSTER.findIndex((r) => r.id === id) + 1) % ROSTER.length].id;

export const MainMenu = ({
  openSelect = false,
  twoPlayer,
}: {
  openSelect?: boolean;
  /** Open on the 2-player select: from a 2-player match's "Change fighters" (`keep`: the tally carries on). */
  twoPlayer?: { p1?: CharacterId; p2?: CharacterId; n: MatchLength; keep: boolean };
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showcase = useRef<{ setCharacter: (id: CharacterId) => void; setFighterHidden: (on: boolean) => void } | null>(null);
  const [screen, setScreen] = useState<Screen>(twoPlayer ? '2p' : openSelect ? 'select' : 'main');
  /** The 2-player select's starting picks and match length. */
  const [twoP, setTwoP] = useState<{ picks: [CharacterId, CharacterId]; n: MatchLength } | null>(
    twoPlayer ? { picks: [twoPlayer.p1 ?? 'hotfix', twoPlayer.p2 ?? twoPlayer.p1 ?? 'legacy'], n: twoPlayer.n } : null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fighter, setFighter] = useState<CharacterId>('hotfix');
  const [level, setLevel] = useState<BotLevel>('normal');
  // The arena for offline matches is remembered in Settings; the menu backdrop follows it (R-020).
  const settings = useSettings();
  const arena = settings.arena;
  const setArena = (id: ArenaId) => getSettings().set({ arena: id });
  const cycleArena = () => {
    menuSound.confirm();
    setArena(ARENA_IDS[(ARENA_IDS.indexOf(arena) + 1) % ARENA_IDS.length]);
  };
  // The very first match runs against the easy bot (firstMatch.ts): show that, instead of NORMAL, until one is finished.
  const [firstMatch, setFirstMatch] = useState(false);
  useEffect(() => {
    if (!readFinishedMatch()) {
      setLevel('easy');
      setFirstMatch(true);
    }
  }, []);
  const [live, setLive] = useState(false);
  const [touch, setTouch] = useState(false);
  /** Which home button had focus last, so coming back from a sub-screen lands where you left. */
  const [lastEntry, setLastEntry] = useState('play');
  const portraitsReady = useFighterPortraits(fighter, { eager: screen === 'select' });
  useMenuTelemetry(portraitsReady);
  // The 2-player select reads the pads itself (each pad drives its own player's panel).
  const pad = useGamepadNav(screen !== '2p');

  useEffect(() => {
    setTouch(isTouchDevice());
    const saved = readCharacter();
    if (saved) setFighter(saved);
    // A fresh 2-player session (not "Change fighters") starts tonight's tally at 0 - 0.
    if (twoPlayer && !twoPlayer.keep) resetTally(sessionStore());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open2P = () => {
    resetTally(sessionStore());
    setTwoP({ picks: [fighter, nextInRoster(fighter)], n: readLength(sessionStore()) });
    setScreen('2p');
  };

  // The live arena behind the menu, started after first paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ startShowcase }) => {
          if (cancelled) return;
          const facts = deviceFacts();
          const tier = renderProfile(getSettings().get(), facts).tier;
          const s = startShowcase(canvas, readCharacter() ?? 'hotfix', {
            arena,
            still: tier === 'low' && facts.touch,
            onReady: () => setLive(true),
          });
          showcase.current = s;
          // The Field Day screens show the fighter as a card, not in the scene (spec b02).
          s.setFighterHidden(true);
          dispose = s.dispose;
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dispose?.();
      showcase.current = null;
      setLive(false);
    };
    // A new arena means a new canvas (the old one lost its context on dispose, see the key on <canvas>).
  }, [arena]);

  // The VS doors' portraits, rendered in idle time once the backdrop has its first frame (R-013 8.10).
  useEffect(() => {
    if (live) warmDoorPortraits();
  }, [live]);

  // The fighter select has its own URL, /characters (site only; the portal keeps its hash routes for whole pages).
  // FIGHTER pushes it, Back / Esc goes back to /, and the browser's Back and Forward buttons move between the two.
  const pushedSelect = useRef(false);
  const openFighterSelect = () => {
    setScreen('select');
    if (PORTAL || window.location.pathname === SELECT_PATH) return;
    window.history.pushState(null, '', SELECT_PATH);
    pushedSelect.current = true;
  };
  useEffect(() => {
    if (PORTAL) return;
    const onPop = () => {
      if (window.location.pathname === SELECT_PATH) {
        setScreen('select');
        pushedSelect.current = true;
      } else {
        pushedSelect.current = false;
        setScreen((s) => (s === 'select' ? 'main' : s));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const vs = useVsTo();
  const busy = useRef(false);
  busy.current = vs.busy;

  const back = () => {
    if (settingsOpen || busy.current) return;
    if (screen !== 'main') {
      menuSound.back();
      if (screen === 'select' && !PORTAL && window.location.pathname === SELECT_PATH) {
        // We pushed /characters: step back in history (popstate finishes the switch). Opened directly: swap the URL.
        if (pushedSelect.current) {
          pushedSelect.current = false;
          window.history.back();
          return;
        }
        window.history.replaceState(null, '', '/');
      }
      setScreen('main');
    }
  };
  const pickFighter = (id: CharacterId) => {
    setFighter(id);
    saveCharacter(id);
  };

  /** Start a 1-player match at once: the VS doors close over the menu (the rival is random; the doors show them). */
  const fight = () => {
    if (vs.busy) return;
    const others = ROSTER.filter((r) => r.id !== fighter);
    const p2 = others[Math.floor(Math.random() * others.length)].id;
    const lvl: BotLevel = firstMatch ? 'easy' : level;
    vs.go(`/arena?p1=${fighter}&p2=${p2}&bot=${lvl}&arena=${arena}`, {
      p1: fighter,
      p2,
      tag1: vsTags('1p', lvl)[0],
      tag2: vsTags('1p', lvl)[1],
      kosToWin: RULES.kosToWin,
      arena,
    });
  };

  const arenaName = ARENA_COPY[arena].name;
  const stepLevel = (dir: 1 | -1) => setLevel((l) => LEVELS[(LEVELS.indexOf(l) + dir + LEVELS.length) % LEVELS.length]);
  const overlayOpen = settingsOpen || screen === 'howto' || screen === 'credits';

  return (
    <main
      data-screen={screen}
      className="relative h-[100dvh] w-full select-none overflow-hidden bg-ink-deep text-cream"
      // A still of the selected arena's backdrop (always Brix) from the first paint; the live scene fades in over it.
      style={{ background: `#0a0d18 url(${asset(arena === 'office' ? 'menu-poster-office.webp' : 'menu-poster.webp')}) center / cover` }}
    >
      <canvas
        key={arena}
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-[400ms] ${live ? 'opacity-100' : 'opacity-0'}`}
      />

      {screen === '2p' && twoP && (
        <TwoPlayerSelect
          initial={twoP.picks}
          length={twoP.n}
          arena={arena}
          onBack={() => {
            resetTally(sessionStore());
            setScreen('main');
          }}
          onFight={(p1, p2, n) =>
            vs.go(`/arena?mode=2p&p1=${p1}&p2=${p2}&n=${n}&arena=${arena}`, { p1, p2, tag1: vsTags('2p')[0], tag2: vsTags('2p')[1], kosToWin: n, arena })
          }
        />
      )}
      {screen === 'main' && !settingsOpen && (
        <Stage className="z-10" testId="home-stage">
          <HomeScreen
            fighter={fighter}
            onFighter={pickFighter}
            arenaName={arenaName}
            koToWin={RULES.kosToWin}
            onPlay={fight}
            onTwoPlayer={show2PMenuItem(touch, pad) ? open2P : undefined}
            // Online is off in the portal build for now (bot play only, decided 2026-11-21).
            onOnline={PORTAL ? undefined : () => navigate('/play')}
            onFighterSelect={openFighterSelect}
            onArena={cycleArena}
            onSettings={() => setSettingsOpen(true)}
            onHowTo={() => setScreen('howto')}
            onCredits={() => setScreen('credits')}
            muted={settings.audio.muted}
            onMute={() => getSettings().setAudio({ muted: !settings.audio.muted })}
            studio={STUDIO_NAME}
            version={GAME_VERSION}
            pad={pad > 0}
            active={!overlayOpen}
            autoFocus={!touch}
            lastFocus={lastEntry}
            onFocusEntry={setLastEntry}
          />
        </Stage>
      )}
      {screen === 'select' && (
        <Stage className="z-10" testId="select-stage">
          <FighterSelect
            fighter={fighter}
            onFighter={pickFighter}
            onFight={fight}
            onBack={back}
            arena={arena}
            arenaName={arenaName}
            onArena={cycleArena}
            level={firstMatch ? 'easy' : level}
            onLevel={stepLevel}
            levelLocked={firstMatch}
            pad={pad > 0}
            active={!overlayOpen}
            busy={vs.busy}
          />
        </Stage>
      )}

      {vs.doors}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
      {screen === 'howto' && <HowToScreen onClose={back} touch={touch} />}
      {screen === 'credits' && <CreditsPanel onClose={back} />}
    </main>
  );
};
