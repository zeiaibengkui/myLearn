// Shell component: build/index.html — Bootstrap navbar, breadcrumb, the
// explorer tree (a pre-rendered Tree element), the content iframe, and the
// client script. The client-side JS/CSS stay plain strings (injected via
// raw()): they execute in the browser, not through the element builder.

import { h, raw, type Element, type Node } from "../h.ts";
import { BOOTSTRAP_CSS, BOOTSTRAP_ICONS_CSS, BOOTSTRAP_JS, JQUERY } from "../cdn.ts";

/** Dark-mode overrides the shell injects into iframe documents (scoped to
 *  `[data-bs-theme="dark"]`, so they are inert when the light theme is on;
 *  Base bootstrap swap happens via the `data-bs-theme` attribute itself). */
const DARK_CSS = [
    '[data-bs-theme="dark"] pre, [data-bs-theme="dark"] code, [data-bs-theme="dark"] .highlight { background-color: #26292e; color: #e9ecef; }',
    '[data-bs-theme="dark"] blockquote { border-color: #495057; }',
    '[data-bs-theme="dark"] td, [data-bs-theme="dark"] th { border-color: #37393d; }',
].join("\n");

/** JS the shell injects into the iframe: re-apply the theme when the shell
 *  toggles it (postMessage — also works when direct frame access is denied). */
const FRAME_THEME_JS = [
    'window.addEventListener("message", function (e) {',
    '  if (e && e.data && e.data.type === "mylearn-theme") {',
    '    document.documentElement.setAttribute("data-bs-theme", e.data.theme);',
    "  }",
    "});",
].join("\n");

/** Shell chrome: minimal rules; colors come from bootstrap CSS variables. */
const SHELL_STYLE = [
    "/* minimal shell chrome; colors come from bootstrap CSS variables */",
    "#tree a {",
    "    padding: 0.15rem 0.5rem;",
    "    border-radius: 0.25rem;",
    "}",
    "#tree a:hover {",
    "    background: var(--bs-secondary-bg);",
    "}",
    "#tree .tree-toggle {",
    "    padding-left: 0.5rem;",
    "    box-shadow: none;",
    "}",
].join("\n");

/** Shell client: dark-mode toggle (persisted in localStorage, default from
 *  prefers-color-scheme), and iframe injection — on every frame load the
 *  shell inspects the frame document, injects the dark CSS + a theme
 *  listener script, and applies `data-bs-theme` directly (falls back to
 *  postMessage when the frame is cross-origin, e.g. opened via file://). */
const SHELL_SCRIPT = `
$(function () {
  var THEME_KEY = "mylearn-theme";
  var theme = localStorage.getItem(THEME_KEY);
  if (!theme) {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var DARK_CSS = ${JSON.stringify(DARK_CSS)};

  // the button shows the *target* theme (moon-stars when flipping to light,
  // sun when flipping to dark); icon is set via .html() — .text() would
  // strip the <i> glyph and leave the raw class.
  function applyShell() {
    document.documentElement.setAttribute("data-bs-theme", theme);
    var label = theme === "dark" ? "light" : "dark";
    var icon = theme === "dark" ? "moon-stars" : "sun";
    $("#themeToggle").html('<i class="bi ' + icon + '"></i> ' + label);
  }
  function injectFrame(frame) {
    var doc, win;
    try {
      doc = frame.contentDocument;
      win = frame.contentWindow;
    } catch (e) {
      return; // cross-origin frame — the shell theme still applies
    }
    if (!doc || !win) return;
    var style = doc.getElementById("mylearn-theme-css");
    if (!style) {
      style = doc.createElement("style");
      style.id = "mylearn-theme-css";
      doc.head.appendChild(style);
    }
    style.textContent = DARK_CSS; // rules are [data-bs-theme="dark"]-scoped
    if (!win.__myLearnThemeFrame) {
      win.__myLearnThemeFrame = true;
      var js = doc.createElement("script");
      js.textContent = ${JSON.stringify(FRAME_THEME_JS)};
      doc.head.appendChild(js);
    }
    doc.documentElement.setAttribute("data-bs-theme", theme);
  }

  $("#themeToggle").on("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyShell();
    var frame = document.getElementById("content");
    injectFrame(frame);
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: "mylearn-theme", theme: theme }, "*");
    }
  });
  $("#content").on("load", function () { injectFrame(this); });

  function escH(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function setCrumbs(href) {
    var segs = (href || "").split("/").filter(Boolean).map(decodeURIComponent);
    var last = segs.length - 1;
    if (last >= 0 && /\.html$/.test(segs[last])) segs[last] = segs[last].replace(/\.html$/, "");
    if (last >= 0 && segs[last] === "index") segs.pop();
    if (!segs.length) {
      $("#crumbs").html('<li class="breadcrumb-item active">myLearn</li>');
      return;
    }
    $("#crumbs").html(
      segs.map(function (s, i) {
        var active = i === segs.length - 1;
        return '<li class="breadcrumb-item' + (active ? ' active" aria-current="page' : '') + '">' + escH(s) + "</li>";
      }).join("")
    );
  }
  $("#tree a").on("click", function (e) {
    e.preventDefault();
    var href = $(this).attr("href");
    $("#content").attr("src", href);
    $("#tree a").removeClass("active");
    $(this).addClass("active");
    setCrumbs(href);
  });
  $("#tree").on("click", ".tree-toggle", function () {
    $(this)
      .find(".tree-caret")
      .toggleClass("bi-chevron-right bi-chevron-down");
  });

  applyShell();
  injectFrame(document.getElementById("content"));
  setCrumbs($("#content").attr("src"));
});
`;

export interface ShellProps {
    /** pre-rendered tree (<ul id="tree">), or null when empty */
    tree: Node | null;
    /** default iframe content (first note leaf href) */
    first: string;
}

export function Shell({ tree, first }: ShellProps): Element {
    return h("html", { lang: "zh-CN" },
        h("head", null,
            h("meta", { charset: "utf-8" }),
            h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
            h("meta", {
                name: "description",
                content: "myLearn knowledge base — problems and notes rendered as a static site",
            }),
            h("meta", { property: "og:title", content: "myLearn — knowledge base" }),
            h("meta", { property: "og:type", content: "website" }),
            h("title", null, "myLearn — knowledge base"),
            h("link", { rel: "stylesheet", href: BOOTSTRAP_CSS }),
            h("link", { rel: "stylesheet", href: BOOTSTRAP_ICONS_CSS }),
            h("style", null, SHELL_STYLE)
        ),
        h("body", { class: "bg-body-tertiary" },
            h("nav", { class: "navbar navbar-dark bg-dark mb-3" },
                h("div", { class: "container-fluid" },
                    h("span", { class: "navbar-brand" },
                        h("i", { class: "bi bi-book me-2", "aria-hidden": "true" }),
                        "myLearn"
                    ),
                    h("span", { class: "navbar-text small" }, "knowledge base"),
                    h("button", {
                        id: "themeToggle",
                        class: "btn btn-sm btn-outline-light",
                        type: "button",
                    }, h("i", { class: "bi bi-moon-stars", "aria-hidden": "true" }), " dark")
                )
            ),
            h("nav", { class: "container-fluid mb-2", "aria-label": "breadcrumb" },
                h("ol", { class: "breadcrumb mb-0", id: "crumbs" })
            ),
            h("div", { class: "container-fluid" },
                h("div", { class: "row g-3" },
                    h("div", { class: "col-3" },
                        h("div", { class: "card" },
                            h("div", { class: "card-body p-2" },
                                tree ?? h("div", { class: "text-muted" }, "nothing to show")
                            )
                        )
                    ),
                    h("div", { class: "col-9" },
                        h("iframe", {
                            id: "content",
                            class: "w-100 rounded border",
                            src: first,
                            style: "height: calc(100vh - 110px);",
                            title: "content",
                        })
                    )
                )
            ),
            h("script", { src: JQUERY }),
            h("script", { src: BOOTSTRAP_JS }),
            h("script", null, raw(SHELL_SCRIPT))
        )
    );
}
