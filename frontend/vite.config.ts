import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to backend during development.
    //
    // Going through the proxy keeps the browser on a single origin, so the
    // httpOnly session cookie is first-party and no CORS handshake is
    // involved. The backend also allows :5173 directly (see main.ts), but
    // the proxy is the simpler path.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Backend mounts tRPC at /trpc (TRPCModule basePath in app.module.ts)
      "/trpc": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
