<script setup lang="ts">
// One tree item: a collapsible folder (bootstrap-icons chevron + folder
// glyphs) or a leaf link. Recursive — self-references as <Folder>. Folder
// open/closed is local state; while the tree is filtered (query non-empty)
// every folder is forced open and non-matching branches are pruned. Leaf
// hrefs are hash-route hrefs ("#/problems/...") — the browser's native
// hashchange drives the router, so no click handler is needed; the active
// leaf is the one matching the current route param.
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import type { ShellNode } from "../types.ts";

const props = defineProps<{
    node: ShellNode;
    openFirst?: boolean;
    query: string;
}>();

const route = useRoute();

const q = computed(() => props.query.trim().toLowerCase());
const filtering = computed(() => q.value !== "");
const isFolder = computed(() => !!props.node.children?.length);
const open = ref(props.openFirst ?? false);
const expanded = computed(() => isFolder.value && (open.value || filtering.value));

const current = computed(() => decodeURIComponent(String(route.params.note ?? "")));
const active = computed(
    () => props.node.href !== undefined && decodeURIComponent(props.node.href) === current.value
);
const linkHref = computed(() =>
    props.node.href ? `#/${props.node.href}` : "#/"
);

function childVisible(c: ShellNode): boolean {
    if (!q.value) return true;
    if (c.title.toLowerCase().includes(q.value)) return true;
    return (c.children ?? []).some(childVisible);
}
const children = computed(() =>
    isFolder.value
        ? (props.node.children ?? []).filter((c) => (q.value ? childVisible(c) : true))
        : []
);
</script>

<template>
  <li>
    <button
      v-if="isFolder"
      type="button"
      class="btn btn-link btn-sm text-start w-100 text-truncate tree-toggle"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="open = !open"
    >
      <i
        class="tree-caret bi"
        :class="expanded ? 'bi-chevron-down' : 'bi-chevron-right'"
        aria-hidden="true"
      ></i>
      <i class="bi bi-folder2 mx-1" aria-hidden="true"></i>{{ node.title }}
    </button>
    <ul v-if="isFolder && expanded" class="list-unstyled ms-3">
      <Folder
        v-for="(c, i) in children"
        :key="c.title + i"
        :node="c"
        :query="query"
      />
    </ul>
    <a
      v-else
      class="d-block text-truncate tree-link"
      :class="{ active }"
      :href="linkHref"
    >{{ node.title }}</a>
  </li>
</template>
