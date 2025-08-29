<template>
  <div class="login-container">
    <el-card class="login-card" shadow="always">
      <template #header>
        <div class="card-header">
          <span>MCP 控制台登录</span>
          <el-button 
            size="small" 
            type="text" 
            @click="showSettings = !showSettings"
            :icon="showSettings ? 'ArrowUp' : 'Setting'"
          >
            {{ showSettings ? '收起设置' : '服务器设置' }}
          </el-button>
        </div>
      </template>
      
      <!-- 服务器设置 -->
      <el-collapse-transition>
        <div v-show="showSettings" class="server-settings">
          <el-form label-width="80px">
            <el-form-item label="服务器地址">
              <el-input
                v-model="backendUrl"
                placeholder="http://localhost:8787"
                @blur="updateBackendUrl"
              >
                <template #append>
                  <el-button @click="testConnection" :loading="testing" size="small">
                    测试
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
            
            <el-form-item>
              <el-tag :type="connectionStatus.connected ? 'success' : 'danger'" size="small">
                {{ connectionStatus.message || (connectionStatus.connected ? '连接正常' : '未连接') }}
              </el-tag>
            </el-form-item>
          </el-form>
          <el-divider />
        </div>
      </el-collapse-transition>
      
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        label-width="80px"
        @submit.prevent="handleLogin"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            :disabled="loading"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            @click="handleLogin"
            :disabled="!connectionStatus.connected"
            style="width: 100%"
          >
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-tips">
        <el-alert
          title="a"
          type="info"
          :closable="false"
          show-icon
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuth } from '@/composables/useAuth';
import { useApi } from '@/composables/useApi';
import type { LoginRequest } from '@shared/types/auth';

const router = useRouter();
const { login } = useAuth();
const { systemConfig, updateSystemConfig, publicRequest } = useApi();

const loginFormRef = ref<FormInstance>();
const loading = ref(false);
const showSettings = ref(false);
const testing = ref(false);
const backendUrl = ref(systemConfig.backendUrl);

const connectionStatus = ref({
  connected: false,
  message: '',
});

const loginForm = reactive<LoginRequest>({
  username: 'admin',
  password: 'admin',
});

const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
  ],
};

const updateBackendUrl = () => {
  updateSystemConfig({ backendUrl: backendUrl.value });
  testConnection();
};

const testConnection = async () => {
  testing.value = true;
  connectionStatus.value = { connected: false, message: '测试中...' };
  
  try {
    const response = await publicRequest('/api/health');
    
    if (response.ok) {
      const data = await response.json();
      connectionStatus.value = {
        connected: true,
        message: '连接成功',
      };
    } else {
      connectionStatus.value = {
        connected: false,
        message: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    connectionStatus.value = {
      connected: false,
      message: '连接失败',
    };
  } finally {
    testing.value = false;
  }
};

const handleLogin = async () => {
  if (!loginFormRef.value) return;
  
  try {
    const valid = await loginFormRef.value.validate();
    if (!valid) return;
    
    if (!connectionStatus.value.connected) {
      ElMessage.error('请先测试服务器连接');
      return;
    }
    
    loading.value = true;
    const result = await login(loginForm);
    
    if (result.success) {
      ElMessage.success('登录成功');
      router.push('/');
    } else {
      ElMessage.error(result.message || '登录失败');
    }
  } catch (error) {
    ElMessage.error('登录过程中发生错误');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  testConnection();
});
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 450px;
  max-width: 90vw;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  font-weight: bold;
}

.server-settings {
  margin-bottom: 16px;
}

.login-tips {
  margin-top: 16px;
}
</style>
