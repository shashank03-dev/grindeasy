import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Lockfiles exist here, at the repo root and at ~/, so Turbopack's root
// inference picks the wrong one and keys client modules under a root the React
// Client Manifest does not share. That desync 500s renders at random. This app
// is the workspace, so pin the root to this file's own directory: process.cwd()
// would silently mean something else the moment a build is invoked from
// anywhere but web/.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
