import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '~': path.resolve(__dirname, 'src') } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The real game server test: Colyseus talks to process.send (a PM2 hook) when it exists, which breaks the forks pool.
    poolMatchGlobs: [['**/*.server.test.ts', 'threads']],
  },
});
