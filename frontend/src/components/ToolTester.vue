<template>
  <div>
    <el-select 
      v-model="selectedTool" 
      placeholder="选择要测试的工具"
      style="width: 300px; margin-bottom: 16px;"
      @change="onToolSelect"
    >
      <el-option 
        v-for="tool in tools" 
        :key="tool.name" 
        :label="tool.title || tool.name" 
        :value="tool.name" 
      />
    </el-select>
    
    <div v-if="currentTool">
      <el-card>
        <template #header>
          <span>{{ currentTool.title || currentTool.name }}</span>
        </template>
        
        <p v-if="currentTool.description">{{ currentTool.description }}</p>
        
        <el-form v-if="currentTool.inputSchema" :model="toolArgs" label-width="140px">
          <el-form-item 
            v-for="(type, key) in currentTool.inputSchema.properties" 
            :key="key" 
            :label="`${key}${currentTool.inputSchema.required?.includes(key) ? ' *' : ''}`"
          >
            <el-input-number 
              v-if="type === 'number'" 
              v-model="toolArgs[key]" 
              :controls="false" 
            />
            <el-input 
              v-else-if="type !== 'json'" 
              v-model="toolArgs[key]" 
            />
            <el-input 
              v-else 
              v-model="toolArgs[key]" 
              type="textarea" 
              :rows="3" 
              placeholder="JSON格式" 
            />
          </el-form-item>
        </el-form>
        
        <el-button type="primary" @click="runTest">运行测试</el-button>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ToolTestRequest } from '@shared/types/test';

const props = defineProps<{
  tools: any[];
}>();

const emit = defineEmits<{
  test: [request: ToolTestRequest];
}>();

const selectedTool = ref('');
const toolArgs = ref<Record<string, any>>({});

const currentTool = computed(() => 
  props.tools.find(t => t.name === selectedTool.value)
);

const onToolSelect = () => {
  toolArgs.value = {};
  const tool = currentTool.value;
  if (tool?.inputSchema?.properties) {
    for (const [key, type] of Object.entries(tool.inputSchema.properties)) {
      toolArgs.value[key] = type === 'number' ? 0 : '';
    }
    for (const key of tool.inputSchema.required ?? []) {
      if (!(key in toolArgs.value)) {
        toolArgs.value[key] = '';
      }
    }
  }
};

const runTest = () => {
  if (!currentTool.value) return;
  
  const args: Record<string, unknown> = {};
  if (currentTool.value.inputSchema?.properties) {
    for (const [key, type] of Object.entries(currentTool.value.inputSchema.properties)) {
      if (type === 'json') {
        try {
          args[key] = toolArgs.value[key] ? JSON.parse(toolArgs.value[key]) : null;
        } catch {
          args[key] = toolArgs.value[key];
        }
      } else {
        args[key] = toolArgs.value[key];
      }
    }
  }
  
  emit('test', {
    toolName: currentTool.value.name,
    args,
  });
};
</script>
