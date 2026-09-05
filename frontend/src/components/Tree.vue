<script setup lang="ts">
// Root of the explorer tree: renders the recursive Folder items from the
// site store (fetches build/tree.json). The filter is the SPA's payoff — it
// narrows the tree client-side and auto-expands matching branches.
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { BFormInput } from "bootstrap-vue-next";
import Folder from "./Folder.vue";
import { useSite } from "../stores/site.ts";

const site = useSite();
const { tree, loading, error } = storeToRefs(site);

const filter = ref("");
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
    <p v-else-if="loading" class="text-muted small mb-0">loading…</p>
    <ul v-else-if="tree.length" class="list-unstyled mb-0" id="tree">
      <Folder
        v-for="(n, i) in tree"
        :key="n.title + i"
        :node="n"
        :open-first="i === 0"
        :query="query"
      />
    </ul>
    <div v-else class="text-muted">nothing to show</div>
  </div>
</template>
