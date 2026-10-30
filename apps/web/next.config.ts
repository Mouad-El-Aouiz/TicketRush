import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@ticketrush/api-client"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://127.0.0.1:3000"}/api/:path*`,
      },
    ];
  },
};
export default config;
