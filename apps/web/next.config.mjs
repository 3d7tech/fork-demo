/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TypeScript source; Next compiles them.
  transpilePackages: ['@fork/ui', '@fork/pipeline', '@fork/models', '@fork/calc', '@fork/spec', '@fork/rules'],
  poweredByHeader: false,
};
export default nextConfig;
