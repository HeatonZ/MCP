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
          <div
            v-for="(type, key) in currentTool.inputSchema?.properties || {}"
            :key="key"
            class="form-row"
          >
            <label>
              {{ key }} ({{ type }})
              <span v-if="currentTool.inputSchema?.required?.includes(key)" class="required">*</span>
            </label>
            <el-input-number v-if="type === 'number'" v-model="toolArgsNumber[key]" :controls="false" />
            <el-switch v-else-if="type === 'boolean'" v-model="toolArgsBoolean[key]" active-text="true" inactive-text="false" />
            <el-input v-else-if="type !== 'json'" v-model="toolArgsText[key]" />
            <el-input v-else v-model="toolArgsText[key]" type="textarea" :rows="3" placeholder="JSON" />
          </div>
        </div>
        <div v-if="currentTool.inputSchema?.source" class="schema-meta">
          <span>Schema 来源: {{ currentTool.inputSchema.source === 'manual' ? '手动补充' : '上游提供' }}</span>
          <span v-if="currentTool.inputSchema.source === 'manual'">
            使用计数: {{ fallbackUsage[currentTool.name]?.count ?? 0 }}
          </span>
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
import { useApi } from "@/composables/useApi";

type UiTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    properties: Record<string, "string"|"number"|"json"|"boolean">;
    required?: string[];
    source?: "upstream" | "manual";
  } | null;
};

const { get, post } = useApi();

const tools = ref<UiTool[]>([]);
const selectedToolName = ref("");
const toolArgsText = ref<Record<string, string>>({});
const toolArgsNumber = ref<Record<string, number | null>>({});
const toolArgsBoolean = ref<Record<string, boolean>>({});
const toolResult = ref("");
const fallbackUsage = ref<Record<string, { count: number; lastUsed?: number }>>({});
const upstreamStatus = ref<Record<string, { namespace?: string; avgLatencyMs: number }>>({});
const currentTool = computed(() => tools.value.find(t => t.name === selectedToolName.value));
const sourceInfo = computed(() => {
  const t = currentTool.value;
  if (!t) return null as null | { namespace?: string; avgLatencyMs: number };
  const ns = t.name.includes("/") ? t.name.split("/")[0] : undefined;
  const match = Object.values(upstreamStatus.value).find(s => s.namespace === ns);
  return match || (ns ? { namespace: ns, avgLatencyMs: 0 } : null);
});

async function loadTools() {
  try {
    const response = await get("/api/tools");
    const json = await response.json();
    tools.value = json.tools ?? [];
    try {
      const fallbackResponse = await get('/api/upstreams/fallback-usage');
      const fallbackJson = await fallbackResponse.json();
      fallbackUsage.value = fallbackJson.usage ?? {};
    } catch { /* ignore */ }
    try {
      const statusResponse = await get('/api/upstreams/status');
      const st = await statusResponse.json();
      const map: Record<string, { namespace?: string; avgLatencyMs: number }> = {};
      for (const it of (st.upstreams ?? [])) map[it.name] = { namespace: it.namespace, avgLatencyMs: it.avgLatencyMs };
      upstreamStatus.value = map;
    } catch { /* ignore */ }
    if (tools.value.length && !selectedToolName.value) {
      selectedToolName.value = tools.value[0].name;
      onSelectTool();
    }
  } catch (error) {
    ElMessage.error("加载工具失败: " + error);
  }
}

function onSelectTool() {
  toolArgsText.value = {};
  toolArgsNumber.value = {};
  toolArgsBoolean.value = {};
  const t = currentTool.value;
  if (t?.inputSchema?.properties) {
    for (const [k, type] of Object.entries(t.inputSchema.properties)) {
      if (type === 'number') {
        toolArgsNumber.value[k] = null;
      } else if (type === 'boolean') {
        toolArgsBoolean.value[k] = false;
      } else {
        toolArgsText.value[k] = "";
      }
    }
    for (const key of t.inputSchema.required ?? []) {
      if (!(key in toolArgsText.value) && !(key in toolArgsNumber.value) && !(key in toolArgsBoolean.value)) {
        toolArgsText.value[key] = "";
      }
    }
  }
  toolResult.value = "";
}

async function callTool() {
  const t = currentTool.value;
  if (!t) return;
  const args: Record<string, unknown> = {};
  if (t.inputSchema?.properties) {
    for (const [k, type] of Object.entries(t.inputSchema.properties)) {
      if (type === "number") {
        const n = toolArgsNumber.value[k];
        args[k] = n == null ? null : Number(n);
      } else if (type === "boolean") {
        args[k] = toolArgsBoolean.value[k] ?? false;
      } else if (type === "json") {
        const raw = toolArgsText.value[k] ?? "";
        try { args[k] = raw ? JSON.parse(raw) : null; } catch { ElMessage.error(`${k} 不是合法 JSON`); return; }
      } else {
        args[k] = toolArgsText.value[k] ?? "";
      }
    }
  }
  const response = await post("/api/tools/call", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: t.name, args }),
  });
  const json = await response.json();
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
.form-row label{ font-weight:500; }
.form-row .required{ color:#f56c6c; margin-left:4px; }
.tool-result pre{ background:#111; color:#0f0; padding:8px; overflow:auto; }
.schema-meta{ font-size:12px; color:#999; margin-top:8px; display:flex; gap:12px; }
</style> 