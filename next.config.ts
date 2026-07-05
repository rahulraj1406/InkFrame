import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { webpack }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      crypto: false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /tflite_web_api_client/,
      })
    );
    return config;
  },
};

export default nextConfig;
