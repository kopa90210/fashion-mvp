import type { NextConfig } from "next";
import { createWardrobeImageConfig } from "./src/lib/media/image-policy";

const nextConfig: NextConfig = {
  images: {
    ...createWardrobeImageConfig(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NODE_ENV,
    ),
  },
  // Allow connections from local network for testing on mobile devices
  allowedDevOrigins: ["192.168.1.36","192.168.137.1", "shaking-heading-erased.ngrok-free.dev", "*.ngrok-free.dev"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      allowedOrigins: ["*.ngrok-free.dev", "*.ngrok.io", "*.ngrok.app", "localhost:3000"],
    },
  },
};

export default nextConfig;
