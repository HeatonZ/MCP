<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>日志</span>
      </template>
      <el-space>
        <el-button @click="loadLogsSnapshot">快照</el-button>
      </el-space>
      <el-divider />
      <el-scrollbar height="480px" class="logs">
        <div v-for="r in logs" :key="r.ts + '-' + r.message" :class="'log ' + r.level">
          <span class="ts">{{ fmtTs(r.ts) }}</span>
          <span class="level">{{ r.level.toUpperCase() }}</span>
          <span class="src">{{ r.source }}</span>
          <span class="msg">{{ r.message }}</span>
        </div>
      </el-scrollbar>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useApi } from "@/composables/useApi";
import { useAuth } from "@/composables/useAuth";

type LogRecord = { ts: number; level: 'debug'|'info'|'warn'|'error'; source: string; message: string };

const { get } = useApi();
const { getAuthHeaders } = useAuth();
const logs = ref<LogRecord[]>([]);
let evtSrc: EventSource | null = null;

function fmtTs(ts: number) {
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function startLogs() {
  if (evtSrc) evtSrc.close();
  
  // EventSource 不支持自定义头，所以我们需要在URL中传递token
  const authHeaders = getAuthHeaders();
  const token = authHeaders.Authorization?.replace('Bearer ', '');
  const url = token ? `/api/logs/sse?token=${encodeURIComponent(token)}` : "/api/logs/sse";
  
  evtSrc = new EventSource(url);
  evtSrc.onmessage = (ev) => {
    try {
      const rec = JSON.parse(ev.data);
      logs.value.push(rec);
      if (logs.value.length > 500) logs.value.shift();
    } catch {}
  };
  evtSrc.onerror = () => {
    ElMessage.error("日志连接断开，重试中...");
    setTimeout(startLogs, 2000);
  };
}

async function loadLogsSnapshot() {
  try {
    const response = await get("/api/logs/snapshot");
    const json = await response.json();
    logs.value = json.items ?? [];
  } catch (error) {
    ElMessage.error("加载日志快照失败: " + error);
  }
}

onMounted(() => {
  startLogs();
});
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
.logs{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size:12px; }
.log{ display:flex; gap:8px; line-height:1.4; }
.log .ts{ color:#888; }
.log.info{ color:#9bd; }
.log.warn{ color:#fd6; }
.log.error{ color:#f99; }
</style> 