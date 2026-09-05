import { createApp } from "vue";
// bundle bootstrap + bootstrap-vue-next styles locally (vite) — the shell
// needs no bootstrap CDN; only the bootstrap-icons font stays a CDN link in
// index.html
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import App from "./App.vue";

createApp(App).mount("#app");
