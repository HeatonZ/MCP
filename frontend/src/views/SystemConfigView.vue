<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>系统配置</span>
          <div class="header-buttons">
            <el-button @click="resetConfig">重置</el-button>
            <el-button type="primary" @click="saveConfig">保存配置</el-button>
          </div>
        </div>
      </template>

      <el-form :model="config" label-width="120px">
        <el-divider content-position="left">后端配置</el-divider>
        
        <el-form-item label="后端地址">
          <el-input 
            v-model="config.backendUrl" 
            placeholder="http://localhost:8787"
          />
          <div class="form-tip">
            MCP服务器的地址，用于API调用
          </div>
        </el-form-item>
        
        <el-form-item label="环境">
          <el-select v-model="config.environment">
            <el-option label="开发环境" value="development" />
            <el-option label="生产环境" value="production" />
            <el-option label="测试环境" value="testing" />
          </el-select>
        </el-form-item>
        
        <el-divider content-position="left">网络配置</el-divider>
        
        <el-form-item label="API超时时间">
          <el-input-number 
            v-model="config.apiTimeout" 
            :min="1000" 
            :max="60000" 
            :step="1000"
          />
          <span style="margin-left: 8px;">毫秒</span>
          <div class="form-tip">
            API请求的超时时间
          </div>
        </el-form-item>
        
        <el-divider content-position="left">调试配置</el-divider>
        
        <el-form-item label="启用调试">
          <el-switch v-model="config.enableDebug" />
          <div class="form-tip">
            启用后会在控制台输出详细的调试信息
          </div>
        </el-form-item>
        
        <el-divider content-position="left">连接测试</el-divider>
        
        <el-form-item label="连接状态">
          <el-space>
            <el-tag :type="connectionStatus.connected ? 'success' : 'danger'">
              {{ connectionStatus.connected ? '已连接' : '未连接' }}
            </el-tag>
            <el-button size="small" @click="testConnection" :loading="testing">
              测试连接
            </el-button>
          </el-space>
          <div v-if="connectionStatus.message" class="form-tip">
            {{ connectionStatus.message }}
          </div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { SystemConfig } from '@shared/types/system_config';
import { useApi } from '@/composables/useApi';

const { systemConfig, updateSystemConfig, publicRequest } = useApi();

const config = ref<SystemConfig>({ ...systemConfig });

const connectionStatus = ref({
  connected: false,
  message: '',
});

const testing = ref(false);

const loadConfig = () => {
  config.value = { ...systemConfig };
};

const saveConfig = () => {
  try {
    updateSystemConfig(config.value);
    ElMessage.success('系统配置已保存');
  } catch (error) {
    ElMessage.error('保存配置失败');
  }
};

const resetConfig = () => {
  config.value = {
    backendUrl: 'http://localhost:8787',
    environment: 'development',
    apiTimeout: 30000,
    enableDebug: false,
  };
  updateSystemConfig(config.value);
  ElMessage.success('配置已重置');
};

const testConnection = async () => {
  testing.value = true;
  connectionStatus.value = { connected: false, message: '测试中...' };
  
  try {
    // 临时更新配置以测试新的后端地址
    updateSystemConfig(config.value);
    
    const response = await publicRequest('/api/health');
    
    if (response.ok) {
      const data = await response.json();
      connectionStatus.value = {
        connected: true,
        message: `连接成功，服务器时间: ${new Date(data.ts).toLocaleString()}`,
      };
      ElMessage.success('连接测试成功');
    } else {
      connectionStatus.value = {
        connected: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
      ElMessage.error('连接测试失败');
    }
  } catch (error) {
    connectionStatus.value = {
      connected: false,
      message: String(error),
    };
    ElMessage.error('连接测试失败');
  } finally {
    testing.value = false;
  }
};

onMounted(() => {
  loadConfig();
  testConnection();
});
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

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
