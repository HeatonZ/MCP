<template>
  <div>
    <el-input 
      v-model="promptName" 
      placeholder="输入提示词名称进行测试"
      style="margin-bottom: 16px;"
    >
      <template #append>
        <el-button @click="runTest">测试提示词</el-button>
      </template>
    </el-input>
    
    <el-input 
      v-model="promptArgs" 
      type="textarea"
      :rows="4"
      placeholder="提示词参数 (JSON格式)"
      style="margin-bottom: 16px;"
    />
    
    <el-alert 
      title="提示词名称示例"
      type="info"
      :closable="false"
      show-icon
    >
      <p>• review-code (本地提示词)</p>
      <p>• 命名空间/提示词名称 (上游提示词)</p>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { PromptTestRequest } from '@shared/types/test';

defineProps<{
  prompts: any[];
}>();

const emit = defineEmits<{
  test: [request: PromptTestRequest];
}>();

const promptName = ref('');
const promptArgs = ref('{}');

const runTest = () => {
  if (!promptName.value.trim()) return;
  
  let args: Record<string, unknown> = {};
  if (promptArgs.value.trim()) {
    try {
      args = JSON.parse(promptArgs.value);
    } catch {
      ElMessage.error('参数格式不正确，请使用有效的JSON格式');
      return;
    }
  }
  
  emit('test', {
    promptName: promptName.value.trim(),
    args,
  });
};
</script>
