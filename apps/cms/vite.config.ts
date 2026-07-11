import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("prosemirror") || id.includes("@tiptap/pm")) return "editor-engine";
          if (id.includes("@tiptap")) return "editor-ui";
          if (id.includes("@octokit")) return "github";
          if (id.includes("/yaml/")) return "content-parser";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) {
            return "react-runtime";
          }
        }
      }
    }
  }
});
