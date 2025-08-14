<template>
  <div class="page">
    <el-page-header content="z-mcp 控制台" />
    <el-menu mode="horizontal" :router="true" :default-active="$route.path">
      <el-menu-item index="/config">配置</el-menu-item>
      <el-menu-item index="/files">文件</el-menu-item>
      <el-menu-item index="/tools">MCP 工具</el-menu-item>
      <el-menu-item index="/logs">日志</el-menu-item>
    </el-menu>
    <router-view />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
</style> 