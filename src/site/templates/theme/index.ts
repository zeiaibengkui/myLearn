// Default theme + a breadcrumb above the doc content (doc-before slot).
// Copied into the project's .vitepress/theme/ by `myLearn site setup`.

import { defineComponent, h } from "vue";
import DefaultTheme from "vitepress/theme";
import Breadcrumb from "./Breadcrumb.vue";
import "./style.css";

const { Layout } = DefaultTheme;

export default {
    extends: DefaultTheme,
    Layout: defineComponent({
        name: "MyLearnLayout",
        setup(_, { slots }) {
            return () =>
                h(Layout, null, {
                    // keep the theme's other slots flowing through
                    ...slots,
                    "doc-before": () => h(Breadcrumb),
                });
        },
    }),
};
