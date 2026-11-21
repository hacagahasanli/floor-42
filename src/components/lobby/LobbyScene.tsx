'use client';

import { useEffect, useRef, useState } from 'react';

import { FRAMING, layoutOf } from './lobbyView';

import type { LobbyScene as SceneApi } from '~/game/render/lobbyScene';
import type { CharacterId } from '~/game/sim/types';
import type { RivalSpot } from './lobbyView';

/**
 * The one canvas behind the whole lobby. The CSS sky, clouds and the fighter's portrait paint first and stay if
 * WebGL is missing; the canvas fades in over them (400 ms) once its first frame is drawn.
 */
export const LobbyScene = ({
  character,
  spot,
  portrait,
}: {
  character: CharacterId;
  spot: RivalSpot;
  portrait: string | null;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneApi | null>(null);
  const [ready, setReady] = useState(false);
  // The scene is created once; the latest props are applied as soon as it exists.
  const latest = useRef({ character, spot });
  latest.current = { character, spot };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let dispose: (() => void) | null = null;
    const frame = () =>
      sceneRef.current?.setFraming(FRAMING[layoutOf(window.innerWidth, window.innerHeight)]);
    void import('~/game/render/lobbyScene')
      .then(({ startLobbyScene }) => {
        if (cancelled) return;
        const scene = startLobbyScene(canvas, latest.current.character, {
          onReady: () => setReady(true),
        });
        sceneRef.current = scene;
        dispose = scene.dispose;
        scene.setCharacter(latest.current.character);
        scene.setRival(latest.current.spot);
        frame();
        if (process.env.NODE_ENV !== 'production')
          (window as unknown as { __lobbyStats?: unknown }).__lobbyStats = scene.stats;
      })
      .catch(() => {
        /* no WebGL: the CSS scene stays */
      });
    window.addEventListener('resize', frame);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', frame);
      sceneRef.current = null;
      dispose?.();
    };
  }, []);

  useEffect(() => sceneRef.current?.setCharacter(character), [character]);
  useEffect(() => sceneRef.current?.setRival(spot), [spot]);

  return (
    <div aria-hidden>
      <div className="lb-fallback">
        <span className="lb-cloud lb-cloud-a" />
        <span className="lb-cloud lb-cloud-b" />
        {portrait && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait}
            alt=""
            className="lb-fallback-portrait"
            style={{ opacity: ready ? 0 : 1 }}
          />
        )}
      </div>
      <canvas ref={canvasRef} className="lb-canvas" data-ready={ready} />
    </div>
  );
};
