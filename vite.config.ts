import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(`1.1.0-multichar-${Date.now().toString(36)}`),
  },
  build: {
    rollupOptions: {
      output: {
        // A new catalog must never reuse a cached application filename.
        entryFileNames: "assets/app-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks: {
          ocr: ["tesseract.js"],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
