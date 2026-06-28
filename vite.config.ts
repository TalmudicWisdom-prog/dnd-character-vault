import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(`1.0.0-${Date.now().toString(36)}`),
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
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
