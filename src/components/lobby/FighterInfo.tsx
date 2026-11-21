'use client';

import { STAT_MAX } from '~/components/MenuShell';
import { useCopy } from '~/components/menu/useCopy';
import { ROSTER } from '~/game/roster';
import { CHARACTERS } from '~/game/sim/constants';

import type { CharacterId } from '~/game/sim/types';

const SPEED = '#3ec5ff';
const JUMP = '#3ddc84';
const WEIGHT = '#ffd23f';

/** Role, name, pitch and the three stats of the picked fighter (left column; phones get a compact row). */
export const FighterInfo = ({ id }: { id: CharacterId }) => {
  const entry = ROSTER.find((r) => r.id === id)!;
  const s = CHARACTERS[id];
  const copy = useCopy().fighters[id];
  const weightWord = s.weight >= 1.2 ? 'hard to shove' : s.weight <= 0.85 ? 'light' : 'average';
  const rows = [
    { label: 'Speed', text: `${s.speed} m/s`, value: s.speed / STAT_MAX.speed, color: SPEED },
    { label: 'Jump', text: `${s.airJumps + 1}× jump`, value: s.jump / STAT_MAX.jump, color: JUMP },
    { label: 'Weight', text: weightWord, value: s.weight / STAT_MAX.weight, color: WEIGHT },
  ];
  const line = `${s.speed} m/s · ${s.airJumps + 1} jumps · ${s.weight >= 1.2 ? 'heavy' : s.weight <= 0.85 ? 'light' : 'average'} weight`;
  return (
    <section aria-label="Your fighter">
      <p className="lb-role">{copy.role}</p>
      <h1 key={id} className="lb-name">
        {entry.name.toUpperCase()}
      </h1>
      <p className="lb-pitch">{copy.pitch}</p>
      <div className="lb-stats">
        {rows.map((r) => (
          <div key={r.label} className="lb-stat-row">
            <div className="lb-stat-head">
              <span>{r.label}</span>
              <b>{r.text}</b>
            </div>
            <div className="lb-stat-track">
              <div
                className="lb-stat-fill"
                style={{ width: `${Math.min(100, r.value * 100)}%`, background: r.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="lb-stats-compact">
        {rows.map((r) => (
          <div key={r.label} className="lb-stat-row">
            <div className="lb-stat-head">
              <span>{r.label}</span>
            </div>
            <div className="lb-stat-track">
              <div
                className="lb-stat-fill"
                style={{ width: `${Math.min(100, r.value * 100)}%`, background: r.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="lb-stats-line">{line}</p>
    </section>
  );
};
