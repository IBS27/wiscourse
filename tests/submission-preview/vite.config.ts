import path from "node:path";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Separate from the app config: the mock backend and mock Canvas never enter the app.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), mockBackend()],
  resolve: { alias: [
    { find: /^convex\/react$/, replacement: path.resolve(import.meta.dirname, "convex-react.ts") },
    { find: "@", replacement: path.resolve(import.meta.dirname, "../../src") },
  ] },
  server: { fs: { allow: [path.resolve(import.meta.dirname, "../..")] } },
});

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Serves `/__mock/*` from backend.ts, running in this server process. */
function mockBackend(): Plugin {
  return {
    name: "submission-preview-backend",
    configureServer(server: ViteDevServer) {
      const load = () => server.ssrLoadModule(path.resolve(import.meta.dirname, "backend.ts")) as Promise<typeof import("./backend")>;
      server.middlewares.use("/__mock", (req, res) => {
        void (async () => {
          const backend = await load();
          const send = (value: unknown) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(value));
          };
          if (req.method === "POST" && req.url === "/call") {
            const { type, name, args } = JSON.parse((await body(req)).toString()) as { type: "query" | "mutation" | "action"; name: string; args: Record<string, unknown> };
            return send(await backend.call(type, name, args));
          }
          if (req.method === "POST" && req.url === "/upload") {
            const type = req.headers["content-type"] ?? "application/octet-stream";
            return send(await backend.upload(new Blob([new Uint8Array(await body(req))], { type })));
          }
          if (req.method === "POST" && req.url === "/control") {
            return send(await backend.control(JSON.parse((await body(req)).toString()) as import("./backend").Control));
          }
          if (req.method === "GET" && req.url === "/state") return send(await backend.state());
          res.statusCode = 404;
          res.end();
        })().catch((error: unknown) => {
          res.statusCode = 500;
          res.end(String(error));
        });
      });
    },
  };
}
