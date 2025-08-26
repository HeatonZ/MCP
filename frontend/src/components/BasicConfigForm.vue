<template>
  <el-form :model="localConfig" label-width="120px">
    <el-row :gutter="20">
      <el-col :span="12">
        <el-form-item label="服务器名称">
          <el-input v-model="localConfig.serverName" @input="emitUpdate" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="版本">
          <el-input v-model="localConfig.version" @input="emitUpdate" />
        </el-form-item>
      </el-col>
    </el-row>
    
    <el-row :gutter="20">
      <el-col :span="12">
        <el-form-item label="HTTP 端口">
          <el-input-number 
            v-model="localConfig.httpPort" 
            :min="1" 
            :max="65535" 
            @change="emitUpdate"
          />
        </el-form-item>
      </el-col>
    </el-row>
    
    <el-divider content-position="left">功能开关</el-divider>
    
    <el-row :gutter="20">
      <el-col :span="12">
        <el-form-item label="HTTP 管理">
          <el-switch 
            v-model="localConfig.features.enableHttpAdmin" 
            @change="emitUpdate"
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="代码编辑">
          <el-switch 
            v-model="localConfig.features.enableCodeEditing" 
            @change="emitUpdate"
          />
        </el-form-item>
      </el-col>
    </el-row>
    
    <el-row :gutter="20">
      <el-col :span="12">
        <el-form-item label="MCP SSE">
          <el-switch 
            v-model="localConfig.features.enableMcpSse" 
            @change="emitUpdate"
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="MCP HTTP">
          <el-switch 
            v-model="localConfig.features.enableMcpHttp" 
            @change="emitUpdate"
          />
        </el-form-item>
      </el-col>
    </el-row>
    
    <el-divider content-position="left">CORS 配置</el-divider>
    
    <el-form-item label="允许的源">
      <el-select 
        v-model="corsOrigins" 
        multiple 
        filterable 
        allow-create 
        placeholder="输入允许的源地址"
        @change="updateCorsOrigins"
        style="width: 100%"
      >
        <el-option label="所有源 (*)" value="*" />
        <el-option label="本地开发 (http://localhost:5173)" value="http://localhost:5173" />
      </el-select>
    </el-form-item>
    
    <el-divider content-position="left">日志配置</el-divider>
    
    <el-form-item label="最大日志数">
      <el-input-number 
        v-model="localConfig.logging.maxLogs" 
        :min="100" 
        :max="10000" 
        @change="emitUpdate"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { AppConfig } from '@shared/types/system';

const props = defineProps<{
  modelValue: AppConfig;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AppConfig];
}>();

const localConfig = ref<AppConfig>({ ...props.modelValue });

const corsOrigins = computed({
  get: () => localConfig.value.cors?.allowedOrigins || ['*'],
  set: (value: string[]) => {
    if (!localConfig.value.cors) {
      localConfig.value.cors = { allowedOrigins: [] };
    }
    localConfig.value.cors.allowedOrigins = value;
    emitUpdate();
  }
});

const updateCorsOrigins = (value: string[]) => {
  corsOrigins.value = value;
};

const emitUpdate = () => {
  emit('update:modelValue', localConfig.value);
};

watch(() => props.modelValue, (newValue) => {
  localConfig.value = { ...newValue };
}, { deep: true });
</script>
