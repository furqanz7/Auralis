import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        support: resolve(__dirname, "support.html"),
        privacy: resolve(__dirname, "privacy.html"),
        terms: resolve(__dirname, "terms.html")
      },
      output: {
        hoistTransitiveImports: false,
        manualChunks(id) {
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react";
          }
          if (
            id.includes("/node_modules/three/") ||
            id.includes("/node_modules/@react-three/fiber/") ||
            id.includes("/node_modules/react-use-measure/") ||
            id.includes("/node_modules/suspend-react/") ||
            id.includes("/node_modules/its-fine/") ||
            id.includes("/node_modules/zustand/")
          ) {
            return "scene";
          }
          if (id.includes("/node_modules/framer-motion/")) {
            return "motion";
          }
          if (
            id.includes("/node_modules/@barba/core/") ||
            id.includes("/node_modules/animejs/")
          ) {
            return "transition";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "icons";
          }
        }
      }
    }
  }
});
