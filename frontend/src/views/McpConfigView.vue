<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>MCP 配置管理</span>
          <div class="header-buttons">
            <el-button type="primary" @click="refreshConfig">刷新配置</el-button>
            <el-button type="success" @click="saveConfig" :disabled="!enableHttpAdmin">保存配置</el-button>
            <el-button @click="addUpstream">添加上游</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="基础配置" name="basic">
          <BasicConfigForm 
            v-model="config" 
            @update:modelValue="onConfigUpdate"
          />
        </el-tab-pane>
        
        <el-tab-pane label="上游配置" name="upstreams">
          <UpstreamConfigList 
            v-model="config.upstreams" 
            @update:modelValue="onUpstreamsUpdate"
            @edit="editUpstream"
            @delete="deleteUpstream"
          />
        </el-tab-pane>
        
        <el-tab-pane label="安全配置" name="security">
          <SecurityConfigForm 
            v-model="config.security" 
            @update:modelValue="onSecurityUpdate"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 上游配置对话框 -->
    <UpstreamConfigDialog
      v-model:visible="upstreamDialogVisible"
      v-model:upstream="currentUpstream"
      @save="saveUpstream"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { AppConfig, UpstreamConfig } from '@shared/types/system';
import { useApi } from '@/composables/useApi';
import BasicConfigForm from '@/components/BasicConfigForm.vue';
import UpstreamConfigList from '@/components/UpstreamConfigList.vue';
import SecurityConfigForm from '@/components/SecurityConfigForm.vue';
import UpstreamConfigDialog from '@/components/UpstreamConfigDialog.vue';

const { get, put } = useApi();

const activeTab = ref('basic');
const enableHttpAdmin = ref(true);
const upstreamDialogVisible = ref(false);
const currentUpstream = ref<UpstreamConfig | null>(null);
const editingUpstreamIndex = ref(-1);

const config = ref<AppConfig>({
  serverName: '',
  version: '',
  httpPort: 8787,
  features: {
    enableHttpAdmin: true,
    enableCodeEditing: true,
    enableMcpSse: true,
    enableMcpHttp: true,
  },
  upstreams: [],
  security: {
    allowedDirs: ['server', 'config'],
    http: {
      allowedHosts: ['*'],
      timeoutMs: 30000,
      maxResponseBytes: 10485760,
    },
  },
  cors: {
    allowedOrigins: ['*'],
  },
  logging: {
    maxLogs: 1000,
  },
});

const refreshConfig = async () => {
  try {
    const response = await get('/api/config');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    config.value = data;
    enableHttpAdmin.value = data.features?.enableHttpAdmin !== false;
    ElMessage.success('配置已刷新');
  } catch (error) {
    ElMessage.error(`刷新配置失败: ${String(error)}`);
  }
};

const saveConfig = async () => {
  try {
    const response = await put('/api/config', config.value);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    
    ElMessage.success('配置保存成功');
    await refreshConfig();
  } catch (error) {
    ElMessage.error(`保存配置失败: ${String(error)}`);
  }
};

const onConfigUpdate = (newConfig: AppConfig) => {
  config.value = { ...config.value, ...newConfig };
};

const onUpstreamsUpdate = (upstreams: UpstreamConfig[]) => {
  config.value.upstreams = upstreams;
};

const onSecurityUpdate = (security: AppConfig['security']) => {
  config.value.security = security;
};

const addUpstream = () => {
  currentUpstream.value = {
    name: '',
    transport: 'stdio',
    command: '',
    enabled: true,
  } as UpstreamConfig;
  editingUpstreamIndex.value = -1;
  upstreamDialogVisible.value = true;
};

const editUpstream = (upstream: UpstreamConfig, index: number) => {
  currentUpstream.value = { ...upstream };
  editingUpstreamIndex.value = index;
  upstreamDialogVisible.value = true;
};

const deleteUpstream = (index: number) => {
  config.value.upstreams?.splice(index, 1);
};

const saveUpstream = (upstream: UpstreamConfig) => {
  if (!config.value.upstreams) {
    config.value.upstreams = [];
  }
  
  if (editingUpstreamIndex.value >= 0) {
    config.value.upstreams[editingUpstreamIndex.value] = upstream;
  } else {
    config.value.upstreams.push(upstream);
  }
  
  upstreamDialogVisible.value = false;
};

onMounted(refreshConfig);
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-buttons {
  display: flex;
  gap: 8px;
}
</style>
