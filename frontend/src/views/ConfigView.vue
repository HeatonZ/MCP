<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>配置</span>
      </template>
      <el-space wrap>
        <el-button type="primary" @click="refreshConfig">刷新配置</el-button>
        <el-button :disabled="!enableHttpAdmin" @click="saveConfig">保存配置</el-button>
      </el-space>
      <el-divider />
      <el-input v-model="configText" type="textarea" :rows="18" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { useApi } from "@/composables/useApi";

type AppConfig = {
  features?: { enableHttpAdmin?: boolean }
};

const { get, put } = useApi();
const configText = ref("{}");
const enableHttpAdmin = ref(true);

async function refreshConfig() {
  try {
    const response = await get("/api/config");
    const json = await response.json();
    configText.value = JSON.stringify(json, null, 2);
    const cfg = json as AppConfig;
    enableHttpAdmin.value = cfg.features?.enableHttpAdmin !== false;
  } catch (error) {
    ElMessage.error("加载配置失败: " + error);
  }
}

async function saveConfig() {
  try {
    const response = await put("/api/config", {
      headers: { "Content-Type": "application/json" },
      body: configText.value,
    });
    if (!response.ok) throw new Error(await response.text());
    ElMessage.success("保存成功");
    await refreshConfig();
  } catch (e:any) {
    ElMessage.error("保存失败: " + String(e?.message || e));
  }
}

onMounted(refreshConfig);
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
</style> 