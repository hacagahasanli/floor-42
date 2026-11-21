import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = resolve(__dirname, '../..');
const initSpy = vi.fn();
const trackSpy = vi.fn();

// Run effects at once, so rendering the starter is just calling it.
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), useEffect: (fn: () => void) => fn() }));
vi.mock('~/lib/telemetry', () => ({ init: (...a: unknown[]) => initSpy(...a), track: (...a: unknown[]) => trackSpy(...a), loadDone: vi.fn() }));

const start = async () => {
  vi.resetModules();
  const { TelemetryInit } = await import('~/components/TelemetryInit');
  TelemetryInit();
};

describe('Floor 42 counts only on the site build', () => {
  beforeEach(() => {
    initSpy.mockClear();
    trackSpy.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('a portal build (NEXT_PUBLIC_PORTAL=1) never starts counting, even if a stats address is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTAL', '1');
    vi.stubEnv('NEXT_PUBLIC_STATS_URL', 'https://stats.example.test/v1/b');
    await start();
    expect(initSpy).not.toHaveBeenCalled();
    expect(trackSpy).not.toHaveBeenCalled();
  });

  it('a local build without a stats address never starts counting', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTAL', '');
    vi.stubEnv('NEXT_PUBLIC_STATS_URL', '');
    await start();
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('the site build starts counting as floor-42 with the address from the environment', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTAL', '');
    vi.stubEnv('NEXT_PUBLIC_STATS_URL', 'https://stats.example.test/v1/b');
    await start();
    expect(initSpy).toHaveBeenCalledWith(expect.objectContaining({ game: 'floor-42', endpoint: 'https://stats.example.test/v1/b' }));
    expect(trackSpy).toHaveBeenCalledWith('load_start');
  });

  it('the address is read only behind the inline portal check, so a portal bundle drops it', () => {
    const src = readFileSync(resolve(root, 'src/components/TelemetryInit.tsx'), 'utf8');
    expect(src).toMatch(/NEXT_PUBLIC_PORTAL === '1' \? undefined : process\.env\.NEXT_PUBLIC_STATS_URL/);
    expect(src.match(/NEXT_PUBLIC_STATS_URL/g)).toHaveLength(2); // the comment and that one expression
  });

  it('the vendored client carries no absolute web address', () => {
    expect(readFileSync(resolve(root, 'src/lib/telemetry.ts'), 'utf8')).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
