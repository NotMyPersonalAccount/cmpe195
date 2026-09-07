import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      // `ws: true` is required -- without it the upgrade request is proxied as
      // plain HTTP and the socket fails with no useful error.
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
