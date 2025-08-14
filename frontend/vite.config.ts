import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks"
  }
}); 