import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the app from /<repo-name>/; hosts that serve from the
  // domain root (Vercel, Netlify) set VITE_BASE_PATH=/ instead.
  base: process.env.VITE_BASE_PATH || "/mess_bus_details/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
