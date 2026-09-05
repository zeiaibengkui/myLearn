// Site store: the two data files the build emits — build/tree.json (nav tree
// with route-path hrefs) and build/notes.json (route path → pre-rendered note
// body). Fetched once on mount; the NoteView looks entries up by route param.

import { defineStore } from "pinia";
import { ref } from "vue";
import type { NoteEntry, ShellNode } from "../types.ts";

export const useSite = defineStore("site", () => {
    const tree = ref<ShellNode[]>([]);
    const entries = ref<Record<string, NoteEntry>>({});
    const loading = ref(true);
    const error = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        error.value = false;
        try {
            const [t, e] = await Promise.all([
                fetch("./tree.json").then((r) => {
                    if (!r.ok) throw new Error(r.statusText);
                    return r.json();
                }),
                fetch("./notes.json").then((r) => {
                    if (!r.ok) throw new Error(r.statusText);
                    return r.json();
                }),
            ]);
            tree.value = t;
            entries.value = e;
        } catch {
            error.value = true;
        } finally {
            loading.value = false;
        }
    }

    function entry(path: string): NoteEntry | undefined {
        return entries.value[path];
    }

    /** href of the first leaf (depth-first) — the site's default note. */
    function firstLeaf(nodes: ShellNode[]): string {
        for (const n of nodes) {
            if (n.href) return n.href;
            const h = n.children ? firstLeaf(n.children) : "";
            if (h) return h;
        }
        return "";
    }

    return { tree, entries, loading, error, load, entry, firstLeaf };
});
