import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuth } from "./composables/useAuth";

const routes: RouteRecordRaw[] = [
  { 
    path: "/login", 
    name: "Login",
    component: () => import("./views/LoginView.vue"),
    meta: { requiresAuth: false }
  },
  { 
    path: "/", 
    redirect: "/config",
    meta: { requiresAuth: true }
  },
  { 
    path: "/config", 
    name: "Config",
    component: () => import("./views/ConfigView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/mcp-config", 
    name: "McpConfig",
    component: () => import("./views/McpConfigView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/mcp-test", 
    name: "McpTest",
    component: () => import("./views/McpTestView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/system-config", 
    name: "SystemConfig",
    component: () => import("./views/SystemConfigView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/files", 
    name: "Files",
    component: () => import("./views/FilesView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/tools", 
    name: "Tools",
    component: () => import("./views/ToolsView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/upstreams", 
    name: "Upstreams",
    component: () => import("./views/UpstreamsView.vue"),
    meta: { requiresAuth: true }
  },
  { 
    path: "/logs", 
    name: "Logs",
    component: () => import("./views/LogsView.vue"),
    meta: { requiresAuth: true }
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const { isAuthenticated, checkAuthStatus } = useAuth();
  
  // 如果路由不需要认证，直接通过
  if (to.meta.requiresAuth === false) {
    // 如果已经登录且访问登录页，重定向到首页
    if (to.name === 'Login' && isAuthenticated.value) {
      next('/');
      return;
    }
    next();
    return;
  }
  
  // 检查认证状态
  if (!isAuthenticated.value) {
    next('/login');
    return;
  }
  
  // 验证token有效性
  const isValid = await checkAuthStatus();
  if (!isValid) {
    next('/login');
    return;
  }
  
  next();
});

export default router; 