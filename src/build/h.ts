// React-style element builder: a component is a function of props returning
// a Node, h(Page, {…}) builds the element tree, and render() flattens it to
// an HTML string <x>…</x>. Text nodes and attribute values are escaped; raw
// HTML is explicit via raw() — only for content we generate ourselves
// (markdown body, client scripts), never user-typed markup.

export interface RawHtml {
    raw: string;
}

export type Node =
    | string
    | number
    | boolean
    | null
    | undefined
    | Element
    | RawHtml
    | Node[];

export interface Element {
    tag: string | Component;
    props: Props;
    children: Node[];
}

export type Props = Record<string, unknown> | null;

// props are loose (`any`) so components can declare their own prop types and
// still be composed through h() — same trade-off as React's JSX.
export type Component = (props: any, children: Node[]) => Node;

/** Build an element (`h("div", {class}, ...)`) or invoke a component. */
export function h(
    tag: string | Component,
    props: Props = null,
    ...children: Node[]
): Element {
    return { tag, props, children };
}

/** Unescaped HTML passthrough (markdown output, generated scripts). */
export function raw(html: string): RawHtml {
    return { raw: html };
}

function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const VOID = new Set(["meta", "link", "br", "img", "hr", "input", "source"]);

function attrs(props: Props): string {
    let out = "";
    if (!props) return out;
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false || k === "dangerouslySetInnerHTML") continue;
        out += ` ${k}="${esc(v === true ? "" : String(v))}"`;
    }
    return out;
}

/** Flatten a node tree into an HTML string. */
export function render(node: Node): string {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(render).join("");
    if (typeof node === "string") return esc(node);
    if (typeof node === "number") return esc(String(node));
    if ("raw" in node) return node.raw;
    const { tag, props, children } = node;
    if (typeof tag === "function") return render(tag(props ?? {}, children));
    const a = attrs(props);
    if (props && typeof props.dangerouslySetInnerHTML === "string") {
        return `<${tag}${a}>${props.dangerouslySetInnerHTML}</${tag}>`;
    }
    return VOID.has(tag)
        ? `<${tag}${a} />`
        : `<${tag}${a}>${render(children)}</${tag}>`;
}
