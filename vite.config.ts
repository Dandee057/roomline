import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps asset paths relative, so the build works on GitHub Pages or in a sub-folder of a website.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", chunkSizeWarningLimit: 1400 }
});
