import { ref } from "vue";

const THEME_KEY = "mylearn-theme";

/** Dark-mode overrides the shell injects into iframe documents (scoped to
 *  `[data-bs-theme="dark"]`, so they are inert when the light theme is on;
 *  base bootstrap swap happens via the `data-bs-theme` attribute itself).
 *  Mirrors DARK_CSS in src/build/components/shell.ts (the fallback shell). */
const DARK_CSS = [
    '[data-bs-theme="dark"] pre, [data-bs-theme="dark"] code, [data-bs-theme="dark"] .highlight { background-color: #26292e; color: #e9ecef; }',
    '[data-bs-theme="dark"] blockquote { border-color: #495057; }',
    '[data-bs-theme="dark"] td, [data-bs-theme="dark"] th { border-color: #37393d; }',
].join("\n");

/** JS injected into iframe documents: re-apply the theme when the shell
 *  toggles it (postMessage — also works when direct frame access is denied). */
const FRAME_THEME_JS = [
    'window.addEventListener("message", function (e) {',
    '  if (e && e.data && e.data.type === "mylearn-theme") {',
    '    document.documentElement.setAttribute("data-bs-theme", e.data.theme);',
    "  }",
    "});",
].join("\n");

/** Shell theme: persistence in localStorage, default from
 *  prefers-color-scheme, `data-bs-theme` on the shell document, and injection
 *  into iframe pages (dark CSS + theme listener, with a postMessage fallback
 *  for cross-origin frames). Port of SHELL_SCRIPT in src/build/components/
 *  shell.ts (the fallback shell). */
export function useTheme() {
    const theme = ref<string>(
        localStorage.getItem(THEME_KEY) ??
            (window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light")
    );

    function apply(): void {
        document.documentElement.setAttribute("data-bs-theme", theme.value);
    }

    function injectFrame(frame: HTMLIFrameElement | null): void {
        let doc: Document | null = null;
        let win: Window | null = null;
        try {
            doc = frame?.contentDocument ?? null;
            win = frame?.contentWindow ?? null;
        } catch {
            return; // cross-origin frame — the shell theme still applies
        }
        if (!doc || !win) return;
        let style = doc.getElementById("mylearn-theme-css");
        if (!style) {
            style = doc.createElement("style");
            style.id = "mylearn-theme-css";
            doc.head.appendChild(style);
        }
        style.textContent = DARK_CSS; // rules are [data-bs-theme="dark"]-scoped
        if (!(win as { __myLearnThemeFrame?: boolean }).__myLearnThemeFrame) {
            (win as { __myLearnThemeFrame?: boolean }).__myLearnThemeFrame = true;
            const js = doc.createElement("script");
            js.textContent = FRAME_THEME_JS;
            doc.head.appendChild(js);
        }
        doc.documentElement.setAttribute("data-bs-theme", theme.value);
    }

    function toggle(): void {
        theme.value = theme.value === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, theme.value);
    }

    return { theme, apply, injectFrame, toggle };
}
