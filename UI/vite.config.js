import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
      "/chat": "http://127.0.0.1:8000",
      "/chats": "http://127.0.0.1:8000",
    },
  },
});
