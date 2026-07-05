import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
    };
    // Redirect the missing tflite_web_api_client imports to our empty stub.
    // tfjs-tflite tries to import a Chrome-internal extension module that doesn't
    // exist in standard browsers. The actual inference uses the WASM backend.
    config.resolve.alias = {
      ...config.resolve.alias,
      './tflite_web_api_client': path.resolve(process.cwd(), 'src/lib/empty-stub.js'),
      '../tflite_web_api_client': path.resolve(process.cwd(), 'src/lib/empty-stub.js'),
    };
    return config;
  },
};

export default nextConfig;
