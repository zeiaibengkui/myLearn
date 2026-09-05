<script setup lang="ts">
// Breadcrumb of the current iframe page: path segments from the iframe href,
// decoded, with .html / index stripped. Port of setCrumbs in
// src/build/components/shell.ts (fallback shell).
import { computed } from "vue";
import { BBreadcrumb } from "bootstrap-vue-next";

const props = defineProps<{ href: string }>();

const items = computed(() => {
    const parts = props.href.split("/").filter(Boolean).map(decodeURIComponent);
    const last = parts.length - 1;
    if (last >= 0 && /\.html$/.test(parts[last])) {
        parts[last] = parts[last].replace(/\.html$/, "");
    }
    if (last >= 0 && parts[last] === "index") parts.pop();
    return parts.length
        ? parts.map((text, i) => ({ text, active: i === parts.length - 1 }))
        : [{ text: "myLearn", active: true }];
});
</script>

<template>
  <BBreadcrumb id="crumbs" :items="items" />
</template>
