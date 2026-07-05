import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
    };
    // @tensorflow/tfjs-tflite's ESM entry (dist/index.js) imports a
    // 'tflite_web_api_client' module that npm doesn't publish under dist/ --
    // the real implementation ships at wasm/tflite_web_api_client.js instead.
    // Point the import there so tfweb.tflite_web_api/TFLiteWebModelRunner are
    // the real objects rather than null.
    config.resolve.alias = {
      ...config.resolve.alias,
      './tflite_web_api_client': require.resolve('@tensorflow/tfjs-tflite/wasm/tflite_web_api_client.js'),
      '../tflite_web_api_client': require.resolve('@tensorflow/tfjs-tflite/wasm/tflite_web_api_client.js'),
    };
    return config;
  },
};

export default nextConfig;
