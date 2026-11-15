/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Served from the domain root on Vercel. src/App.tsx reads this back through
  // import.meta.env.BASE_URL, so changing it here is enough to move the app
  // under a sub-path.
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  test: {
    // The API has its own suite and its own config: `cd server && npm test`.
    exclude: ["**/node_modules/**", "**/dist/**", "server/**", "puppeteer-debug/**", "tmp/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
