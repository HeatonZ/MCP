<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>MCP 工具</span>
      </template>
      <el-space>
        <el-button @click="loadTools">刷新工具</el-button>
        <el-select v-model="selectedToolName" style="width: 220px" @change="onSelectTool">
          <el-option v-for="t in tools" :key="t.name" :label="t.title || t.name" :value="t.name" />
        </el-select>
      </el-space>
      <el-divider />
      <div v-if="currentTool">
        <div class="tool-desc">
          {{ currentTool.description }}
          <span v-if="sourceInfo" style="margin-left:8px; color:#999">[来源: {{ sourceInfo.namespace }} | 延迟: ~{{ sourceInfo.avgLatencyMs }}ms]</span>
        </div>
        <div class="tool-form">
          <div v-for="(type, key) in currentTool.inputSchema || {}" :key="key" class="form-row">
            <label>{{ key }} ({{ type }})</label>
            <el-input-number v-if="type === 'number'" v-model="toolArgsNumber[key]" :controls="false" />
            <el-input v-else-if="type !== 'json'" v-model="toolArgsText[key]" />
            <el-input v-else v-model="toolArgsText[key]" type="textarea" :rows="3" placeholder="JSON" />
          </div>
        </div>
        <el-button type="primary" @click="callTool">调用</el-button>
      </div>
      <el-divider />
      <div v-if="toolResult" class="tool-result">
        <h4>结果</h4>
        <pre>{{ toolResult }}</pre>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";

type UiTool = { name: string; title?: string; description?: string; inputSchema?: Record<string, "string"|"number"|"json"> };

const tools = ref<UiTool[]>([]);
const selectedToolName = ref("");
const toolArgsText = ref<Record<string, string>>({});
const toolArgsNumber = ref<Record<string, number | null>>({});
const toolResult = ref("");
const currentTool = computed(() => tools.value.find(t => t.name === selectedToolName.value));
const upstreamStatus = ref<Record<string, { namespace?: string; avgLatencyMs: number }>>({});
const sourceInfo = computed(() => {
  const t = currentTool.value;
  if (!t) return null as null | { namespace?: string; avgLatencyMs: number };
  const ns = t.name.includes("/") ? t.name.split("/")[0] : undefined;
  const match = Object.values(upstreamStatus.value).find(s => s.namespace === ns);
  return match || (ns ? { namespace: ns, avgLatencyMs: 0 } : null);
});

async function loadTools() {
  const res = await fetch("/api/tools");
  const json = await res.json();
  tools.value = json.tools ?? [];
  try {
    const st = await fetch('/api/upstreams/status').then(r => r.json());
    const map: Record<string, { namespace?: string; avgLatencyMs: number }> = {};
    for (const it of (st.upstreams ?? [])) map[it.name] = { namespace: it.namespace, avgLatencyMs: it.avgLatencyMs };
    upstreamStatus.value = map;
  } catch { /* ignore */ }
  if (tools.value.length && !selectedToolName.value) {
    selectedToolName.value = tools.value[0].name;
    onSelectTool();
  }
}

function onSelectTool() {
  toolArgsText.value = {};
  toolArgsNumber.value = {};
  const t = currentTool.value;
  if (t?.inputSchema) {
    for (const [k, type] of Object.entries(t.inputSchema)) {
      if (type === 'number') toolArgsNumber.value[k] = null;
      else toolArgsText.value[k] = "";
    }
  }
  toolResult.value = "";
}

async function callTool() {
  const t = currentTool.value;
  if (!t) return;
  const args: Record<string, unknown> = {};
  if (t.inputSchema) {
    for (const [k, type] of Object.entries(t.inputSchema)) {
      if (type === "number") {
        const n = toolArgsNumber.value[k];
        args[k] = n == null ? null : Number(n);
      } else if (type === "json") {
        const raw = toolArgsText.value[k] ?? "";
        try { args[k] = raw ? JSON.parse(raw) : null; } catch { ElMessage.error(`${k} 不是合法 JSON`); return; }
      } else args[k] = toolArgsText.value[k] ?? "";
    }
  }
  const res = await fetch("/api/tools/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: t.name, args }),
  });
  const json = await res.json();
  if (json.ok === false) {
    toolResult.value = JSON.stringify(json, null, 2);
    ElMessage.error("调用失败");
    return;
  }
  toolResult.value = JSON.stringify(json, null, 2);
  ElMessage.success("调用成功");
}

onMounted(loadTools);
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
.tool-desc{ color:#666; margin-bottom:8px; }
.form-row{ display:flex; flex-direction:column; margin-bottom:8px; }
.tool-result pre{ background:#111; color:#0f0; padding:8px; overflow:auto; }
</style> 