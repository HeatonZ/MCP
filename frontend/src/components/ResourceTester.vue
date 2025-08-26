<template>
  <div>
    <el-input 
      v-model="resourceUri" 
      placeholder="输入资源URI进行测试"
      style="margin-bottom: 16px;"
    >
      <template #append>
        <el-button @click="runTest">测试资源</el-button>
      </template>
    </el-input>
    
    <el-alert 
      title="资源URI示例"
      type="info"
      :closable="false"
      show-icon
    >
      <p>• upstream://上游名称/编码后的URI</p>
      <p>• config://app</p>
      <p>• greeting://用户名</p>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ResourceTestRequest } from '@shared/types/test';

defineProps<{
  resources: any[];
}>();

const emit = defineEmits<{
  test: [request: ResourceTestRequest];
}>();

const resourceUri = ref('');

const runTest = () => {
  if (!resourceUri.value.trim()) return;
  
  emit('test', {
    resourceUri: resourceUri.value.trim(),
  });
};
</script>
