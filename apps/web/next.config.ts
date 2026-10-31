import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Production deploy (Freestyle VM): standalone server traced from the monorepo root. NEXT_DIST_DIR keeps `next build`
  // away from the .next folder the dev server uses.
  output: "standalone",
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@banshee/contracts"],
  // drei <Html> remounts its React roots once at load (harmless console error); keep the dev badge off the projector.
  reactStrictMode: false,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
