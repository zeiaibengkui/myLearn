/** Mirror of src/build/components/tree.ts's ShellNode — the shape of
 *  build/tree.json (written by src/build/index.ts). */
export interface ShellNode {
    title: string;
    href?: string;
    children?: ShellNode[];
}
