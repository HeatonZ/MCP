<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <span>上游状态</span>
        <el-button class="pull-right" size="small" @click="load">刷新</el-button>
      </template>
      <el-table :data="rows" style="width: 100%">
        <el-table-column prop="name" label="名称" width="160" />
        <el-table-column prop="transport" label="传输" width="100" />
        <el-table-column prop="connected" label="连接" width="90">
          <template #default="{ row }">
            <el-tag :type="row.connected ? 'success' : 'danger'">{{ row.connected ? '已连接' : '未连接' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="toolCount" label="工具" width="80" />
        <el-table-column prop="resourceCount" label="资源" width="80" />
        <el-table-column prop="promptCount" label="提示词" width="80" />
        <el-table-column prop="modelCount" label="模型" width="80" />
        <el-table-column prop="avgLatencyMs" label="平均延迟(ms)" width="140" />
        <el-table-column prop="reconnects" label="重连次数" width="100" />
        <el-table-column prop="lastError" label="最后错误" />
      </el-table>
    </el-card>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';

type Row = {
  name: string;
  transport: string;
  connected: boolean;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  modelCount: number;
  avgLatencyMs: number;
  reconnects: number;
  lastError?: string;
};

const rows = ref<Row[]>([]);

async function load() {
  try {
    const res = await fetch('/api/upstreams/status');
    const json = await res.json();
    rows.value = (json.upstreams ?? []) as Row[];
  } catch (e) {
    ElMessage.error(String(e));
  }
}

onMounted(load);
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
.pull-right{ float:right; }
</style>


