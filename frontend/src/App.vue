<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";
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
import ThemeToggle from "./components/ThemeToggle.vue";
import { useTheme } from "./composables/useTheme.ts";

const current = ref("");
const frame = ref<HTMLIFrameElement | null>(null);
const { theme, apply, injectFrame, toggle } = useTheme();

const open = (href: string) => {
    current.value = href;
};

// shared with the recursive tree (inject in Folder.vue — no event echo at
// every depth)
provide("linkCtx", { current, open });

onMounted(() => {
    apply();
    injectFrame(frame.value);
});
watch(theme, () => {
    apply();
    injectFrame(frame.value);
    frame.value?.contentWindow?.postMessage(
        { type: "mylearn-theme", theme: theme.value },
        "*"
    );
});
</script>

<template>
  <BApp>
    <BNavbar type="dark" class="bg-dark mb-3">
      <BContainer fluid>
        <BNavbarBrand>
          <i class="bi bi-book me-2" aria-hidden="true"></i>myLearn
        </BNavbarBrand>
        <span class="navbar-text small">knowledge base</span>
        <ThemeToggle :theme="theme" @toggle="toggle" />
      </BContainer>
    </BNavbar>
    <BContainer fluid class="mb-2">
      <Breadcrumb :href="current" />
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
          <iframe
            id="content"
            ref="frame"
            class="w-100 rounded border"
            :src="current"
            style="height: calc(100vh - 110px)"
            title="content"
            @load="injectFrame(frame)"
          ></iframe>
        </BCol>
      </BRow>
    </BContainer>
  </BApp>
</template>

<style>
/* minimal shell chrome; colors come from bootstrap CSS variables */
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
</style>
