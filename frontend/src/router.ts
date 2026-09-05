// Hash history: `#/problems/luogu/P4001` (and `#/problems/luogu/P4001#样例-1`
// for an in-page anchor — the second # is the router's location fragment).
// Hash URLs survive static/file serving, unlike history URLs. One catch-all
// route; NoteView renders the entry for the decoded `note` param.

import { createRouter, createWebHashHistory } from "vue-router";
import NoteView from "./components/NoteView.vue";

export const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        // everything after "#/" — the note's route path, e.g.
        // "problems/luogu/P4001" or "notes/algos/trick"
        { path: "/:note(.*)", name: "note", component: NoteView },
    ],
    scrollBehavior(to, _from, savedPosition) {
        if (savedPosition) return savedPosition;
        if (to.hash) return { el: to.hash };
        return { top: 0 };
    },
});
