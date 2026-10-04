import type { NextConfig } from "next";
// Imported for its side effect: it throws on boot if configuration is missing.
import "./lib/env";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
