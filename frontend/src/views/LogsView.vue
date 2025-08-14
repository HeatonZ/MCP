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

type LogRecord = { ts: number; level: 'debug'|'info'|'warn'|'error'; source: string; message: string };

const logs = ref<LogRecord[]>([]);
let evtSrc: EventSource | null = null;

function fmtTs(ts: number) {
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function startLogs() {
  if (evtSrc) evtSrc.close();
  evtSrc = new EventSource("/api/logs/sse");
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
  const res = await fetch("/api/logs/snapshot");
  const json = await res.json();
  logs.value = json.items ?? [];
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