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
    // proxy API calls to backend during development
    proxy: {
      // REST fallback (legacy api-client)
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // tRPC endpoint (nestjs-trpc default basePath)
      "/trpc": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Uploaded and seeded images. The backend stores them under MEDIA_ROOT
      // and hands back relative "/media/..." paths, so without this an <img>
      // resolves against the dev server and 404s.
      "/media": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Google OAuth redirects (FR-AUTH-01). Not a tRPC/REST call - the
      // browser navigates here directly - but it still needs to resolve to
      // the backend rather than the dev server in local development.
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
