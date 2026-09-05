import { createApp } from "vue";
import { createPinia } from "pinia";
// bundle bootstrap + bootstrap-vue-next + katex styles locally (vite) — the
// shell needs no bootstrap/katex CDN; only the bootstrap-icons font stays a
// CDN link in index.html (katex CSS must match the server-side markdown-it
// katex version, pinned in root package.json: katex ^0.6.0)
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import "katex/dist/katex.min.css";
import App from "./App.vue";
import { router } from "./router.ts";

createApp(App).use(createPinia()).use(router).mount("#app");
