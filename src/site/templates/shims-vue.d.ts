// Repo-only type shim so the root tsc accepts the theme's SFC import
// (VitePress compiles .vue natively in the project — this file is NOT
// copied by `site setup`).
declare module "*.vue" {
    import type { DefineComponent } from "vue";
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
    export default component;
}

declare module "*.css";
