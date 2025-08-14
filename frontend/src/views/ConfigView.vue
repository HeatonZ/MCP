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

type AppConfig = {
  features?: { enableHttpAdmin?: boolean }
};

const configText = ref("{}");
const enableHttpAdmin = ref(true);

async function refreshConfig() {
  const res = await fetch("/api/config");
  const json = await res.json();
  configText.value = JSON.stringify(json, null, 2);
  const cfg = json as AppConfig;
  enableHttpAdmin.value = cfg.features?.enableHttpAdmin !== false;
}

async function saveConfig() {
  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: configText.value,
    });
    if (!res.ok) throw new Error(await res.text());
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