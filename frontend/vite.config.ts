import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevtools from "vite-plugin-vue-devtools";

// The shell SPA. Built in two ways:
//  - programmatically by the CLI (`myLearn build` / daemon) via
//    src/build/frontend.ts — the vite `build()` API with an optional outDir
//    override for tests;
//  - by hand: `pnpm run fe:build`.
// The SPA replaces the whole site — note bodies come from build/notes.json
// (rendered server-side by the CLI), so vite builds only the shell.
export default defineConfig({
    base: "./",
    plugins: [vue(), vueDevtools()],
    // No vite dev server in this workflow (the daemon serves the built site),
    // so vue-devtools' dev overlay never mounts — still expose the app hook
    // for the browser Vue devtools extension on the built bundle.
    define: { __VUE_PROD_DEVTOOLS__: true },
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
