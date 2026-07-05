import type { NextConfig } from "next";

import path from 'path';

const nextConfig: NextConfig = {
  webpack: (config, { webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /tflite_web_api_client/,
        path.resolve(__dirname, 'src/lib/empty-stub.js')
      )
    );
    return config;
  },
};

export default nextConfig;
