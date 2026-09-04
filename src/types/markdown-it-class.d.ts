// markdown-it-class ships no types (CJS: module.exports = plugin function).
// Like markdown-it-katex, parameters stay untyped-agnostic (`md: unknown`) —
// the export= MarkdownIt instance interface can't be named in type position.
declare module "markdown-it-class" {
    export default function classPlugin(
        md: unknown,
        mapping?: Record<string, string | string[]>
    ): void;
}
