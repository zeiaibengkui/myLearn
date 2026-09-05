import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The shell SPA. Built in two ways:
//  - programmatically by the CLI (`myLearn build` / daemon) via
//    src/build/frontend.ts — the vite `build()` API with an optional outDir
//    override for tests;
//  - by hand: `pnpm run fe:build`.
// The SPA only replaces build/index.html — note pages stay static HTML.
export default defineConfig({
    base: "./",
    plugins: [vue()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
