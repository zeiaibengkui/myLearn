// markdown-it-katex (CJS) ships no types. The plugin is
// `function (md: MarkdownIt, options?) => void`; md is typed loosely because
// @types/markdown-it exports the instance interface via `export =`, which
// cannot be named in a type position from a module declaration.
declare module "markdown-it-katex" {
    export default function mdKatex(
        md: unknown,
        options?: Record<string, unknown>
    ): void;
}
