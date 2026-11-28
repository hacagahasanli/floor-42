import { httpUrl, median, nearest, parseRegions, probeRegions } from './regions';

describe('regions (off unless NEXT_PUBLIC_GAME_REGIONS is set)', () => {
  it('parses the region list and skips garbage; unset means no regions (today\'s single server)', () => {
    expect(parseRegions(undefined)).toEqual([]);
    expect(parseRegions('')).toEqual([]);
    expect(parseRegions('fra=wss://a.fly.dev, iad=wss://b.fly.dev,bad,x=http://no,,sin=ws://localhost:1')).toEqual([
      { id: 'fra', url: 'wss://a.fly.dev' },
      { id: 'iad', url: 'wss://b.fly.dev' },
      { id: 'sin', url: 'ws://localhost:1' },
    ]);
    expect(httpUrl('wss://a.fly.dev')).toBe('https://a.fly.dev');
    expect(httpUrl('ws://localhost:2567')).toBe('http://localhost:2567');
  });

  it('probes every region, keeps the median of four after a warm-up, drops a region that does not answer', async () => {
    const lat: Record<string, number[]> = { 'a.dev': [90, 41, 38, 44, 200], 'b.dev': [200, 130, 120, 125, 121] };
    let clock = 0;
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      const host = new URL(url).host;
      if (host === 'dead.dev') throw new Error('down');
      calls.push(host);
      clock += lat[host].shift()!;
      return { ok: true };
    };
    const probes = await probeRegions(
      [{ id: 'a', url: 'wss://a.dev' }, { id: 'b', url: 'wss://b.dev' }, { id: 'c', url: 'wss://dead.dev' }],
      fetchFn,
      () => clock,
    );
    expect(probes.find((p) => p.id === 'c')!.rtt).toBe(Infinity);
    expect(probes.filter((p) => p.id !== 'c').every((p) => Number.isFinite(p.rtt))).toBe(true);
    expect(calls.filter((h) => h === 'a.dev')).toHaveLength(5);
    expect(median([41, 38, 44, 200])).toBe(42.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBe(Infinity);
    expect(nearest([{ id: 'a', rtt: 38 }, { id: 'b', rtt: 120 }, { id: 'c', rtt: Infinity }])).toEqual({ id: 'a', rtt: 38 });
    expect(nearest([{ id: 'c', rtt: Infinity }])).toBeNull();
  });
});
