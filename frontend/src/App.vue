<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import {
    BApp,
    BCard,
    BCardBody,
    BCol,
    BContainer,
    BNavbar,
    BNavbarBrand,
    BRow,
} from "bootstrap-vue-next";
import Tree from "./components/Tree.vue";
import Breadcrumb from "./components/Breadcrumb.vue";
import NoteView from "./components/NoteView.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { useSite } from "./stores/site.ts";
import { useTheme } from "./stores/theme.ts";

const site = useSite();
site.load(); // tree.json + notes.json (one-time on mount)

const theme = useTheme();
const { theme: themeName } = storeToRefs(theme);
onMounted(() => theme.apply());
</script>

<template>
  <BApp>
    <BNavbar type="dark" class="bg-dark mb-3">
      <BContainer fluid>
        <BNavbarBrand>
          <i class="bi bi-book me-2" aria-hidden="true"></i>myLearn
        </BNavbarBrand>
        <span class="navbar-text small">knowledge base</span>
        <ThemeToggle :theme="themeName" @toggle="theme.toggle" />
      </BContainer>
    </BNavbar>
    <BContainer fluid class="mb-2">
      <Breadcrumb />
    </BContainer>
    <BContainer fluid>
      <BRow class="g-3">
        <BCol cols="3">
          <BCard>
            <BCardBody class="p-2">
              <Tree />
            </BCardBody>
          </BCard>
        </BCol>
        <BCol cols="9">
          <BCard>
            <BCardBody>
              <NoteView />
            </BCardBody>
          </BCard>
        </BCol>
      </BRow>
    </BContainer>
  </BApp>
</template>

<style>
/* shell chrome + dark-mode overrides for note bodies; colors come from
   bootstrap CSS variables */
#tree a {
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    text-decoration: none;
    color: inherit;
}
#tree a:hover {
    background: var(--bs-secondary-bg);
}
#tree a.active {
    background: var(--bs-primary-bg-subtle);
    color: var(--bs-primary-text-emphasis);
}
#tree .tree-toggle {
    padding-left: 0.5rem;
    box-shadow: none;
}

/* note content renders in the shell document — apply the dark theme's
   content tweaks globally (scoped to [data-bs-theme="dark"], so they are
   inert in light mode; the base swap happens via data-bs-theme itself).
   Port of the old iframe DARK_CSS (composables/useTheme.ts). */
[data-bs-theme="dark"] pre,
[data-bs-theme="dark"] code,
[data-bs-theme="dark"] .highlight {
    background-color: #26292e;
    color: #e9ecef;
}
[data-bs-theme="dark"] blockquote {
    border-color: #495057;
}
[data-bs-theme="dark"] td,
[data-bs-theme="dark"] th {
    border-color: #37393d;
}
</style>
