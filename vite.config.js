import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        admin: resolve(root, "admin/index.html"),
        loanRules: resolve(root, "loan-rules.html"),
        privacy: resolve(root, "privacy.html"),
      },
    },
  },
});
