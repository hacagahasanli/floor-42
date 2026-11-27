'use client';

import { Bunting } from '~/components/fieldday/Bunting';
import { FdButton } from '~/components/fieldday/Button';
import { Icon } from '~/components/fieldday/Icon';
import { Keycap } from '~/components/fieldday/parts';
import { Frame } from '~/components/fieldday/Stage';
import { Modal, TitleRibbon } from '~/components/fieldday/screens/Modal';
import { STUDIO_NAME } from '~/lib/studio';

import type { ReactNode } from 'react';

/**
 * Credits (b17): bunting, a 700 wide panel with a CREDITS ribbon, A GAME BY / SOUND / FONTS / BUILT WITH, and BACK. Opens from the
 * home footer link and from the last row of Settings > Accessibility. Add new credits as sections of the same shape.
 * The font line lists every family the build ships (Field Day's Titan One and Baloo 2, plus Bungee and Chakra Petch while the
 * rest of the game still uses them): the licence texts are in public/licenses.
 */
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <div className="fd-sec">{title}</div>
    <div style={{ font: "700 17px/1.3 'Baloo 2', sans-serif", marginTop: 4 }}>{children}</div>
  </div>
);

export const CreditsPanel = ({ onClose }: { onClose: () => void }) => (
  <Modal label="Credits" tint={0.42} onBack={onClose} escCapture z={70} testId="credits">
    <Bunting variant={4} />
    <Frame>
      <div className="fd-panel" style={{ left: '50%', marginLeft: -350, top: 118, width: 700, height: 478 }} />
      <TitleRibbon top={86} tilt={-2} icon={<Icon name="star" size={30} />}>
        CREDITS
      </TitleRibbon>
      <div className="fd-abs" style={{ left: '50%', marginLeft: -310, top: 186, width: 620, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div>
          <div className="fd-sec">A GAME BY</div>
          <div className="fd-titan" style={{ fontSize: 30, marginTop: 6 }}>
            {STUDIO_NAME.toUpperCase()}
          </div>
        </div>
        <Section title="SOUND">
          Gun sounds by Snake (f8studios),
          <br />
          from Snake&apos;s Authentic Gun Sounds.
        </Section>
        <Section title="FONTS">
          Titan One by Rodrigo Fuenzalida · Baloo 2 by Ek Type
          <br />
          Bungee by David Jonathan Ross · Chakra Petch by Cadson Demak
          <br />
          SIL Open Font License 1.1
        </Section>
        <Section title="BUILT WITH">three.js, React and Next.js</Section>
      </div>
      <div className="fd-abs" style={{ left: 0, right: 0, top: 498, display: 'flex', justifyContent: 'center' }}>
        <FdButton tone="white" size="md" fontSize={22} icon="back" sound="back" data-nav data-nav-pref data-testid="credits-back" after={<Keycap k="ESC" />} onClick={onClose}>
          BACK
        </FdButton>
      </div>
    </Frame>
  </Modal>
);
