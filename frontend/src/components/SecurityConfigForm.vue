<template>
  <el-form :model="localSecurity" label-width="140px">
    <el-divider content-position="left">文件系统安全</el-divider>
    
    <el-form-item label="允许的目录">
      <el-select 
        v-model="allowedDirs" 
        multiple 
        filterable 
        allow-create 
        placeholder="输入允许访问的目录"
        @change="updateAllowedDirs"
        style="width: 100%"
      >
        <el-option label="server" value="server" />
        <el-option label="config" value="config" />
        <el-option label="shared" value="shared" />
        <el-option label="frontend" value="frontend" />
      </el-select>
      <div class="form-tip">
        配置允许文件操作API访问的目录列表
      </div>
    </el-form-item>
    
    <el-divider content-position="left">HTTP 安全</el-divider>
    
    <el-form-item label="允许的主机">
      <el-select 
        v-model="allowedHosts" 
        multiple 
        filterable 
        allow-create 
        placeholder="输入允许访问的主机"
        @change="updateAllowedHosts"
        style="width: 100%"
      >
        <el-option label="所有主机 (*)" value="*" />
        <el-option label="localhost" value="localhost" />
        <el-option label="127.0.0.1" value="127.0.0.1" />
      </el-select>
      <div class="form-tip">
        配置HTTP工具允许访问的主机列表
      </div>
    </el-form-item>
    
    <el-row :gutter="20">
      <el-col :span="12">
        <el-form-item label="请求超时(ms)">
          <el-input-number 
            v-model="localSecurity.http.timeoutMs" 
            :min="1000" 
            :max="300000" 
            :step="1000"
            @change="emitUpdate"
          />
          <div class="form-tip">HTTP请求的超时时间</div>
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="最大响应大小">
          <el-input-number 
            v-model="maxResponseMB" 
            :min="1" 
            :max="100" 
            :precision="1"
            @change="updateMaxResponseBytes"
          />
          <span style="margin-left: 8px;">MB</span>
          <div class="form-tip">HTTP响应的最大大小限制</div>
        </el-form-item>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { AppConfig } from '@shared/types/system';

const props = defineProps<{
  modelValue?: AppConfig['security'];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AppConfig['security']];
}>();

const localSecurity = ref<NonNullable<AppConfig['security']>>({
  allowedDirs: ['server', 'config'],
  http: {
    allowedHosts: ['*'],
    timeoutMs: 30000,
    maxResponseBytes: 10485760,
  },
  ...props.modelValue,
});

const allowedDirs = computed({
  get: () => localSecurity.value.allowedDirs || [],
  set: (value: string[]) => {
    localSecurity.value.allowedDirs = value;
    emitUpdate();
  }
});

const allowedHosts = computed({
  get: () => localSecurity.value.http?.allowedHosts || ['*'],
  set: (value: string[]) => {
    if (!localSecurity.value.http) {
      localSecurity.value.http = {
        allowedHosts: [],
        timeoutMs: 30000,
        maxResponseBytes: 10485760,
      };
    }
    localSecurity.value.http.allowedHosts = value;
    emitUpdate();
  }
});

const maxResponseMB = computed({
  get: () => (localSecurity.value.http?.maxResponseBytes || 10485760) / 1048576,
  set: (value: number) => {
    if (!localSecurity.value.http) {
      localSecurity.value.http = {
        allowedHosts: ['*'],
        timeoutMs: 30000,
        maxResponseBytes: 10485760,
      };
    }
    localSecurity.value.http.maxResponseBytes = Math.round(value * 1048576);
    emitUpdate();
  }
});

const updateAllowedDirs = (value: string[]) => {
  allowedDirs.value = value;
};

const updateAllowedHosts = (value: string[]) => {
  allowedHosts.value = value;
};

const updateMaxResponseBytes = (value: number) => {
  maxResponseMB.value = value;
};

const emitUpdate = () => {
  emit('update:modelValue', localSecurity.value);
};

watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    localSecurity.value = { ...localSecurity.value, ...newValue };
  }
}, { deep: true });
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
