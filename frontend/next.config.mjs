/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // `next dev` otherwise writes frontend/AGENTS.md; repo agent rules live in the root AGENTS.md.
  agentRules: false,
};

export default nextConfig;
