import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/config" },
  { path: "/config", component: () => import("./views/ConfigView.vue") },
  { path: "/files", component: () => import("./views/FilesView.vue") },
  { path: "/tools", component: () => import("./views/ToolsView.vue") },
  { path: "/upstreams", component: () => import("./views/UpstreamsView.vue") },
  { path: "/logs", component: () => import("./views/LogsView.vue") },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router; 