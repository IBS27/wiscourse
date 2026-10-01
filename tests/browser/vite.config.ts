import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Separate from the app config: test identity and transport never enter the app.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: "@clerk/clerk-react", replacement: path.resolve(import.meta.dirname, "clerk.tsx") },
    { find: "@/lib/hooks", replacement: path.resolve(import.meta.dirname, "hooks.ts") },
    { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
  ] },
  server: { fs: { allow: [path.resolve(import.meta.dirname, "../..")] } },
});
