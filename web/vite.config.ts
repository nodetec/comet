import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 3100,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tanstackStart({ srcDirectory: "src" }), viteReact(), tailwindcss()],
});
