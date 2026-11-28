import { encodeSnapshot } from './protocol';

import type { Authority } from './authority';

/** The wire text of the next snapshot for both seats (the server sends it as it is). Shared with tools/netlab/sim.mts. */
export const snapshotMessage = (auth: Authority, seq: number): string => {
  const snap = auth.snapshot();
  const [a, b] = snap.seats;
  return encodeSnapshot({
    seq,
    ack: [a.ack, b.ack],
    inputs: [a.wire, b.wire],
    next: [a.next, b.next],
    state: { ...snap.state, events: [] },
    ev: auth.takeEvents() ?? undefined,
  });
};
