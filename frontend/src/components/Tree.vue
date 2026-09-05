<script setup lang="ts">
// Root of the explorer tree: loads build/tree.json (written by the site
// build) and renders the recursive Folder items. The filter is the SPA's
// payoff over the pre-rendered h.ts Tree — it narrows the tree client-side
// and auto-expands matching branches.
import { computed, onMounted, ref } from "vue";
import { BFormInput } from "bootstrap-vue-next";
import Folder from "./Folder.vue";
import type { ShellNode } from "../types.ts";

const nodes = ref<ShellNode[]>([]);
const filter = ref("");
const error = ref(false);

onMounted(async () => {
    try {
        const res = await fetch("./tree.json");
        if (!res.ok) throw new Error(res.statusText);
        nodes.value = await res.json();
    } catch {
        error.value = true;
    }
});

const query = computed(() => filter.value.trim().toLowerCase());
</script>

<template>
  <div>
    <BFormInput
      v-model="filter"
      size="sm"
      class="mb-2"
      type="search"
      placeholder="filter…"
      aria-label="filter tree"
    />
    <p v-if="error" class="text-muted small mb-0">
      tree.json unavailable — serve the site via
      <code>myLearn daemon</code>
    </p>
    <ul v-else-if="nodes.length" class="list-unstyled mb-0" id="tree">
      <Folder
        v-for="(n, i) in nodes"
        :key="n.title + i"
        :node="n"
        :open-first="i === 0"
        :query="query"
      />
    </ul>
    <div v-else class="text-muted">nothing to show</div>
  </div>
</template>
