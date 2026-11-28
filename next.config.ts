import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // NETLAB=1 (tools/netlab): strict mode's double-mounted effects join the invite room twice in dev.
  reactStrictMode: process.env.NETLAB !== '1',
  devIndicators: false,
};

export default nextConfig;
