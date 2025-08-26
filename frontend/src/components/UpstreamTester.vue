<template>
  <div>
    <el-table :data="upstreams" style="width: 100%">
      <el-table-column prop="name" label="上游名称" width="150" />
      <el-table-column prop="transport" label="传输方式" width="100" />
      <el-table-column prop="connected" label="连接状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.connected ? 'success' : 'danger'">
            {{ row.connected ? '已连接' : '未连接' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="测试操作">
        <template #default="{ row }">
          <el-space>
            <el-button size="small" @click="testConnection(row.name)">
              测试连接
            </el-button>
            <el-button size="small" @click="testTools(row.name)">
              测试工具
            </el-button>
            <el-button size="small" @click="testResources(row.name)">
              测试资源
            </el-button>
            <el-button size="small" @click="testPrompts(row.name)">
              测试提示词
            </el-button>
          </el-space>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import type { UpstreamTestRequest } from '@shared/types/test';

defineProps<{
  upstreams: any[];
}>();

const emit = defineEmits<{
  test: [request: UpstreamTestRequest];
}>();

const testConnection = (upstreamName: string) => {
  emit('test', { upstreamName, testType: 'connection' });
};

const testTools = (upstreamName: string) => {
  emit('test', { upstreamName, testType: 'tools' });
};

const testResources = (upstreamName: string) => {
  emit('test', { upstreamName, testType: 'resources' });
};

const testPrompts = (upstreamName: string) => {
  emit('test', { upstreamName, testType: 'prompts' });
};
</script>
