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
    },
  },
});
