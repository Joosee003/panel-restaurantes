import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path("."),
  base: "/pruebas-agencia/",
  resolve: {
    alias: [
      {
        find: "@/app/(app)/lib/supabaseClient",
        replacement: path("./supabase.ts"),
      },
      { find: "next/link", replacement: path("./link.tsx") },
      { find: "next/navigation", replacement: path("./navigation.ts") },
      { find: "@", replacement: path("../../") },
    ],
  },
  oxc: { jsx: { runtime: "automatic" } },
  build: {
    outDir: "../../public/pruebas-agencia",
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: path("./index.html"), mobile: path("./mobile.html") },
    },
  },
});
