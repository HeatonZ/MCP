<template>
  <div>
    <div class="results-header">
      <span>测试结果 ({{ results.length }})</span>
      <el-button size="small" @click="$emit('clear')">清空结果</el-button>
    </div>
    
    <el-table :data="results" style="width: 100%" max-height="600">
      <el-table-column prop="timestamp" label="时间" width="160">
        <template #default="{ row }">
          {{ formatTime(row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="getTypeTagType(row.type)">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="success" label="结果" width="100">
        <template #default="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'">
            {{ row.success ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="message" label="消息" min-width="200" />
      <el-table-column prop="duration" label="耗时" width="100">
        <template #default="{ row }">
          {{ row.duration }}ms
        </template>
      </el-table-column>
      <el-table-column label="详情" width="100">
        <template #default="{ row }">
          <el-button 
            size="small" 
            @click="showDetails(row)"
            :disabled="!row.data"
          >
            查看
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <!-- 详情对话框 -->
    <el-dialog v-model="detailsVisible" title="测试详情" width="800px">
      <pre class="details-content">{{ detailsData }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TestResult } from '@shared/types/test';

defineProps<{
  results: Array<TestResult & { type: string; name: string; timestamp: number }>;
}>();

defineEmits<{
  clear: [];
}>();

const detailsVisible = ref(false);
const detailsData = ref('');

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

const getTypeTagType = (type: string) => {
  switch (type) {
    case 'upstream': return 'primary';
    case 'tool': return 'success';
    case 'resource': return 'warning';
    case 'prompt': return 'info';
    default: return '';
  }
};

const showDetails = (result: any) => {
  detailsData.value = JSON.stringify(result.data, null, 2);
  detailsVisible.value = true;
};
</script>

<style scoped>
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: bold;
}

.details-content {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  max-height: 400px;
  overflow: auto;
}
</style>
