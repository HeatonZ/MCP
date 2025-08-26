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
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 详细日志显示请求头
            console.log('🔄 Proxy Request:', req.method, req.url, {
              hasAuth: !!req.headers.authorization,
              authHeader: req.headers.authorization ? `Bearer ${req.headers.authorization.substring(7, 15)}...` : 'none'
            });
            
            // 确保所有头信息都被转发
            Object.keys(req.headers).forEach(key => {
              if (req.headers[key]) {
                proxyReq.setHeader(key, req.headers[key]);
              }
            });
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📥 Proxy Response:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@shared": resolve(__dirname, "../shared"),
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks"
  }
}); 