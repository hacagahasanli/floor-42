'use client';

import { FdButton } from '~/components/fieldday/Button';
import { Icon } from '~/components/fieldday/Icon';
import { Keycap } from '~/components/fieldday/parts';
import { Frame } from '~/components/fieldday/Stage';
import { Modal } from '~/components/fieldday/screens/Modal';

import { clock, OVERLAY_COPY as C } from './onlineCopy';

import type { ReactNode } from 'react';

import './online.css';

/**
 * In-match online overlays in Field Day (R-032 5.4-5.6, F-081, mockups o14-o16): the blurred match with a 50 % grape tint, a
 * paper panel 520 wide with a ribbon (tomato only for LINK EXPIRED), a Titan clock, sun + white buttons. Behaviour unchanged.
 */
export type OverlayUi =
  | { k: 'dropped'; seconds: number }
  | { k: 'left'; waitLeft: number; last: boolean; copied: boolean; link: boolean; quickRoom: boolean }
  | { k: 'asking'; last: boolean }
  | { k: 'expired' }
  | { k: 'gl' };

export interface OverlayHandlers {
  onCopy?: () => void;
  onLeave?: () => void;
  onKeep?: () => void;
  onNewRoom?: () => void;
  onQuick?: () => void;
  onReload?: () => void;
}

const Box = ({ top, height, ribbon, err, icon, children }: { top: number; height: number; ribbon: string; err?: boolean; icon?: 'link'; children: ReactNode }) => (
  <Frame>
    <div className="on-panel" style={{ left: 380, top, width: 520, height }} data-testid="online-overlay">
      <div className={`on-ribbon ${err ? 'on-err' : ''}`}>
        {icon && <Icon name={icon} />}
        <span className="fd-titan fd-ol">{ribbon}</span>
      </div>
      {children}
    </div>
  </Frame>
);

const Line = ({ top, children }: { top: number; children: ReactNode }) => (
  <div className="on-line" style={{ left: 32, right: 32, top, textAlign: 'center' }}>
    {children}
  </div>
);
const Small = ({ top, children }: { top: number; children: ReactNode }) => (
  <div className="on-small" style={{ left: 32, right: 32, top, textAlign: 'center' }}>
    {children}
  </div>
);
const Clock = ({ top, size, s }: { top: number; size: number; s: number }) => (
  <div className="fd-titan" style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', fontSize: size, color: 'var(--grape)' }} data-testid="overlay-clock">
    {clock(s)}
  </div>
);
const btn = (top: number) => ({ position: 'absolute' as const, left: 32, top, width: 448 });

export const OnlineOverlay = ({ ui, h, portal }: { ui: OverlayUi; h: OverlayHandlers; portal: boolean }) => {
  const label = ui.k;
  // Esc: leave (left / asking), nothing while on hold (behaviour unchanged).
  const onBack = ui.k === 'left' || ui.k === 'asking' ? h.onLeave : undefined;
  return (
    <Modal label={label} onBack={onBack} escCapture z={40} testId={`overlay-${ui.k}`}>
      {ui.k === 'dropped' && (
        <Box top={190} height={300} ribbon={C.dropped.ribbon}>
          <Line top={54}>{C.dropped.line}</Line>
          <Clock top={136} size={72} s={ui.seconds} />
          <Small top={226}>{C.dropped.small}</Small>
        </Box>
      )}
      {ui.k === 'left' &&
        (ui.quickRoom ? (
          <Box top={170} height={330} ribbon={C.left.ribbon}>
            <Line top={56}>{C.left.quickLine}</Line>
            <FdButton tone="sun" size="md" icon="bolt" primary data-nav data-nav-pref style={btn(130)} onClick={h.onQuick}>
              {C.left.quick}
            </FdButton>
            <FdButton tone="white" size="md" icon="back" sound="back" data-nav style={btn(224)} onClick={h.onLeave}>
              {C.left.menu}
            </FdButton>
          </Box>
        ) : portal || !ui.link ? (
          <Box top={170} height={330} ribbon={C.left.ribbon}>
            <Line top={56}>{C.left.portalLine}</Line>
            <Clock top={112} size={64} s={ui.waitLeft} />
            {ui.last && <Small top={190}>{C.left.last}</Small>}
            <FdButton tone="white" size="md" icon="back" sound="back" data-nav data-nav-pref style={btn(224)} after={<Keycap k="ESC" />} onClick={h.onLeave}>
              {C.left.leave}
            </FdButton>
          </Box>
        ) : (
          <Box top={150} height={420} ribbon={C.left.ribbon}>
            <Line top={52}>{C.left.line}</Line>
            <Clock top={118} size={64} s={ui.waitLeft} />
            {ui.last && <Small top={186}>{C.left.last}</Small>}
            <FdButton tone="sun" size="md" icon={ui.copied ? 'check' : 'copy'} primary data-nav data-nav-pref style={btn(210)} onClick={h.onCopy}>
              {ui.copied ? C.left.copied : C.left.copy}
            </FdButton>
            <FdButton tone="white" size="md" icon="back" sound="back" data-nav style={btn(306)} after={<Keycap k="ESC" />} onClick={h.onLeave}>
              {C.left.leave}
            </FdButton>
          </Box>
        ))}
      {ui.k === 'asking' && (
        <Box top={170} height={330} ribbon={C.asking.ribbon}>
          <Line top={56}>{ui.last ? C.asking.lastLine : C.asking.line}</Line>
          <FdButton tone="sun" size="md" icon="clock" primary data-nav data-nav-pref style={btn(130)} onClick={h.onKeep}>
            {ui.last ? C.asking.lastKeep : C.asking.keep}
          </FdButton>
          <FdButton tone="white" size="md" icon="back" sound="back" data-nav style={btn(224)} after={<Keycap k="ESC" />} onClick={h.onLeave}>
            {C.asking.leave}
          </FdButton>
        </Box>
      )}
      {ui.k === 'expired' && (
        <Box top={170} height={360} ribbon={C.expired.ribbon} err icon="link">
          <Line top={52}>{C.expired.line}</Line>
          <Small top={112}>{C.expired.small}</Small>
          <FdButton tone="sun" size="md" icon="link" primary data-nav data-nav-pref style={btn(160)} onClick={h.onNewRoom}>
            {C.expired.newRoom}
          </FdButton>
          <FdButton tone="white" size="md" icon="bolt" data-nav style={btn(252)} onClick={h.onQuick}>
            {C.expired.quick}
          </FdButton>
        </Box>
      )}
      {ui.k === 'gl' && (
        <Box top={200} height={290} ribbon={C.gl.ribbon}>
          <Line top={54}>{C.gl.line}</Line>
          <Small top={118}>{C.gl.small}</Small>
          <FdButton tone="sun" size="md" icon="again" primary data-nav data-nav-pref style={btn(170)} onClick={h.onReload}>
            {C.gl.reload}
          </FdButton>
        </Box>
      )}
    </Modal>
  );
};
