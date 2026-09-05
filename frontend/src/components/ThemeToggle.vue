<script setup lang="ts">
import { BButton } from "bootstrap-vue-next";

// The button shows the *target* theme: moon-stars when flipping to light,
// sun when flipping to dark — same semantics as the fallback shell in
// src/build/components/shell.ts.
defineProps<{ theme: string }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <BButton id="themeToggle" size="sm" variant="outline-light" @click="$emit('toggle')">
    <i
      :class="theme === 'dark' ? 'bi bi-moon-stars' : 'bi bi-sun'"
      aria-hidden="true"
    ></i>
    {{ theme === "dark" ? "light" : "dark" }}
  </BButton>
</template>
