import { buntingPennants } from './geometry';
import { useStage } from './Stage';

/**
 * The bunting string (spec 5): 24 pennants per 1280 px, each swinging +-5 degrees around its top (2.6 s alternate, 0.37 s
 * stagger per pennant); the string never moves. Menu screens only (boot, home, credits). `variant` rotates the colour order so
 * two screens do not look identical. The width follows the stage, so a wider window gets more pennants, not bigger ones.
 */
const COLORS = ['#FFC83D', '#FF7A2F', '#22C3A6', '#4CB8FF', '#FFF3D6', '#FF5D8F'];
export const Bunting = ({ variant = 0, height = 80 }: { variant?: number; height?: number }) => {
  const { w } = useStage();
  const width = w + 20;
  const pens = buntingPennants(width);
  return (
    <svg className="fd-bunting" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-testid="bunting">
      <path d={`M0 4 Q${width / 2} 54 ${width} 4`} fill="none" stroke="#3B1F6B" strokeWidth="3" />
      {pens.map((p, i) => (
        <g key={i} className="fd-pen" style={{ animationDelay: `${-((i * 0.37) % 2.6)}s` }}>
          <path
            d={`M${p.x - 15} ${p.y} L${p.x + 15} ${p.y + 1.5} L${p.x} ${p.y + 34}Z`}
            fill={COLORS[(i + variant) % COLORS.length]}
            stroke="#3B1F6B"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
};
