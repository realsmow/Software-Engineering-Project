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
  // #183: libraries in their own chunks, so the first load is not one 677 kB
  // file and an app-only deploy keeps the browser's cached copies.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/recharts|d3-|victory-vendor/.test(id)) return "charts";
          if (/react-dom|react-router|scheduler|[\\/]react[\\/]/.test(id)) return "react";
          if (/@tanstack|@trpc/.test(id)) return "data";
          if (/i18next/.test(id)) return "i18n";
          if (/@radix-ui|lucide-react/.test(id)) return "ui";
          return "vendor";
        },
      },
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
