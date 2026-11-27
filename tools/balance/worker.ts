import { parentPort, workerData } from 'node:worker_threads';

import { runMatch } from './match';

import type { MatchArgs } from './match';

parentPort!.postMessage((workerData as MatchArgs[]).map((a) => runMatch(a)));
