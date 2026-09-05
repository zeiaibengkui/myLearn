<script setup lang="ts">
// Renders the note for the current route ("/" → default first note; anything
// else is a route path keying build/notes.json). The body is pre-rendered
// HTML (server-side markdown-it: katex, TOC, heading permalinks) shown with
// v-html. Link handling: `#/...` hrefs in the body are hash-route links —
// the browser's native hashchange already navigates; the only case native
// behavior misses is clicking the exact URL already in the address bar
// (no hashchange fires) — scroll by hand then.
import { computed, nextTick, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useSite } from "../stores/site.ts";

const route = useRoute();
const router = useRouter();
const site = useSite();
const { loading, error } = storeToRefs(site);

/** decoded route path — the notes.json key and tree.json href form */
const path = computed(() => decodeURIComponent(String(route.params.note ?? "")));
const entry = computed(() => site.entry(path.value));

watchEffect(() => {
    document.title = entry.value
        ? `${entry.value.title} — myLearn`
        : "myLearn — knowledge base";
});

// home route without a note → jump to the first leaf (the tree's default)
watchEffect(() => {
    if (loading.value || error.value || path.value) return;
    const leaf = site.firstLeaf(site.tree);
    if (leaf) router.replace("/" + leaf);
});

function scrollTo(frag: string): void {
    nextTick(() => {
        const el = frag ? document.getElementById(frag) : null;
        if (el) el.scrollIntoView();
        else window.scrollTo({ top: 0 });
    });
}

function onContentClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
    }
    const a = (e.target as HTMLElement).closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith("#/")) return;
    const hash = href.slice(2);
    const [pathPart, frag = ""] = hash.split("#");
    const same = decodeURIComponent(pathPart) === path.value && route.hash.slice(1) === frag;
    if (same) {
        e.preventDefault();
        scrollTo(frag);
    }
}
</script>

<template>
  <div>
    <h1 v-if="entry" class="h3 mb-3">{{ entry.title }}</h1>
    <div
      v-if="entry"
      class="note-body"
      v-html="entry.html"
      @click="onContentClick"
    ></div>
    <p v-else-if="loading" class="text-muted mb-0">loading…</p>
    <p v-else-if="error" class="text-muted mb-0">
      tree.json/notes.json unavailable — serve the site via
      <code>myLearn daemon</code>
    </p>
    <p v-else-if="path" class="text-muted mb-0">
      no note at <code>{{ path }}</code>
    </p>
    <p v-else class="text-muted mb-0">
      nothing to show — fetch a problem or write a note
    </p>
  </div>
</template>
