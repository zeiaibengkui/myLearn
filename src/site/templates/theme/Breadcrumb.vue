<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

// Crumbs from the source page path: problems/x/y/problem.md and every
// index.md collapse to their directory ("/problems/x/y/"), matching the
// config's rewrites + cleanUrls. Home has no path → no crumbs.
const { page } = useData();

const crumbs = computed(() => {
    let segments = page.value.relativePath
        .replace(/\.md$/, "")
        .split("/")
        .filter(Boolean);
    const last = segments[segments.length - 1];
    if (last === "index" || last === "problem") segments = segments.slice(0, -1);
    return segments.map((seg, i) => ({
        text: decodeURIComponent(seg),
        link: "/" + segments.slice(0, i + 1).join("/") + (i < segments.length - 1 ? "/" : ""),
    }));
});
</script>

<template>
  <nav v-if="crumbs.length" aria-label="Breadcrumb" class="mylearn-crumbs">
    <a href="/">Home</a>
    <template v-for="(crumb, i) in crumbs" :key="i">
      <span aria-hidden="true">&nbsp;/&nbsp;</span>
      <a v-if="i < crumbs.length - 1" :href="crumb.link">{{ crumb.text }}</a>
      <span v-else aria-current="page">{{ crumb.text }}</span>
    </template>
  </nav>
</template>

<style scoped>
.mylearn-crumbs {
  font-size: 0.85rem;
  opacity: 0.75;
  margin-bottom: 0.75rem;
}
.mylearn-crumbs a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}
.mylearn-crumbs a:hover {
  color: var(--vp-c-brand-1);
}
</style>
