// Theme store: persistence in localStorage, default from
// prefers-color-scheme, `data-bs-theme` on the document. Content is no longer
// an iframe — note bodies render in the shell document, so the dark-mode
// overrides live in App.vue's global style (scoped to
// `[data-bs-theme="dark"]`). Port of the old useTheme (composables/).

import { defineStore } from "pinia";
import { ref } from "vue";

const THEME_KEY = "mylearn-theme";

export const useTheme = defineStore("theme", () => {
    const theme = ref<string>(
        localStorage.getItem(THEME_KEY) ??
            (window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
    );

    function apply(): void {
        document.documentElement.setAttribute("data-bs-theme", theme.value);
    }

    function toggle(): void {
        theme.value = theme.value === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, theme.value);
    }

    return { theme, apply, toggle };
});
