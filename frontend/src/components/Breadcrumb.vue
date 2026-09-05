<script setup lang="ts">
// Breadcrumb of the current note: route path segments (decoded by the
// router), last one active.
import { computed } from "vue";
import { useRoute } from "vue-router";
import { BBreadcrumb } from "bootstrap-vue-next";

const route = useRoute();

const items = computed(() => {
    const parts = String(route.params.note ?? "")
        .split("/")
        .filter(Boolean)
        .map(decodeURIComponent);
    return parts.length
        ? parts.map((text, i) => ({ text, active: i === parts.length - 1 }))
        : [{ text: "myLearn", active: true }];
});
</script>

<template>
  <BBreadcrumb id="crumbs" :items="items" />
</template>
