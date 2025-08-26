<template>
  <div v-if="!isLoginPage" class="page">
    <el-page-header>
      <template #content>
        <span>z-mcp 控制台</span>
      </template>
      <template #extra>
        <el-space>
          <span>欢迎，{{ authUser }}</span>
          <el-button size="small" @click="handleLogout">登出</el-button>
        </el-space>
      </template>
    </el-page-header>
    
    <el-menu mode="horizontal" :router="true" :default-active="$route.path">
      <el-menu-item index="/config">基础配置</el-menu-item>
      <el-menu-item index="/mcp-config">MCP配置</el-menu-item>
      <el-menu-item index="/mcp-test">MCP测试</el-menu-item>
      <el-menu-item index="/system-config">系统配置</el-menu-item>
      <el-menu-item index="/files">文件管理</el-menu-item>
      <el-menu-item index="/tools">工具调用</el-menu-item>
      <el-menu-item index="/upstreams">上游状态</el-menu-item>
      <el-menu-item index="/logs">系统日志</el-menu-item>
    </el-menu>
    
    <router-view />
  </div>
  
  <router-view v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuth } from './composables/useAuth';

const route = useRoute();
const router = useRouter();
const { authUser, logout } = useAuth();

const isLoginPage = computed(() => route.name === 'Login');

const handleLogout = async () => {
  await logout();
  ElMessage.success('已退出登录');
  router.push('/login');
};
</script>

<style scoped>
.page{ 
  display: flex; 
  flex-direction: column; 
  gap: 16px; 
  padding: 16px; 
  min-height: 100vh;
}
</style> 