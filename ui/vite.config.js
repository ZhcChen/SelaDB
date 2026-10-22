import { defineConfig } from "vite";

// base 用相对路径,构建产物可直接从任意目录静态托管
export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 8030,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8030,
    strictPort: true,
  },
});
