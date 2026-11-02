import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build to plain files in out/, served by the FastAPI backend.
  output: "export",
};

export default nextConfig;
