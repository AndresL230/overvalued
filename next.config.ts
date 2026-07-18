import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "q1hlr76qehnlfpdb.public.blob.vercel-storage.com",
        port: "",
        pathname: "/resumes/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
