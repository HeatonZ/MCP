<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑上游配置' : '添加上游配置'"
    width="800px"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="localUpstream"
      :rules="formRules"
      label-width="120px"
    >
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="名称" prop="name">
            <el-input v-model="localUpstream.name" placeholder="上游服务名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="命名空间">
            <el-input v-model="localUpstream.namespace" placeholder="可选，默认使用名称" />
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="传输方式" prop="transport">
            <el-select v-model="localUpstream.transport" @change="onTransportChange">
              <el-option label="STDIO" value="stdio" />
              <el-option label="HTTP" value="http" />
              <el-option label="SSE" value="sse" />
              <el-option label="WebSocket" value="ws" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="启用状态">
            <el-switch v-model="localUpstream.enabled" />
          </el-form-item>
        </el-col>
      </el-row>
      
      <!-- STDIO 配置 -->
      <template v-if="localUpstream.transport === 'stdio'">
        <el-form-item label="命令" prop="command">
          <el-input v-model="localUpstream.command" placeholder="执行命令" />
        </el-form-item>
        
        <el-form-item label="参数">
          <el-input
            v-model="argsText"
            type="textarea"
            :rows="3"
            placeholder="每行一个参数"
            @input="updateArgs"
          />
        </el-form-item>
        
        <el-form-item label="工作目录">
          <el-input v-model="localUpstream.cwd" placeholder="可选，命令执行目录" />
        </el-form-item>
      </template>
      
      <!-- HTTP/SSE/WS 配置 -->
      <template v-else>
        <el-form-item label="URL" prop="url">
          <el-input v-model="localUpstream.url" placeholder="服务地址" />
        </el-form-item>
        
        <el-form-item label="请求头">
          <el-input
            v-model="headersText"
            type="textarea"
            :rows="3"
            placeholder="JSON格式的请求头"
            @input="updateHeaders"
          />
        </el-form-item>
      </template>
      
      <el-divider content-position="left">重连配置</el-divider>
      
      <el-form-item label="启用重连">
        <el-switch v-model="reconnectEnabled" @change="updateReconnectConfig" />
      </el-form-item>
      
      <template v-if="reconnectEnabled">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="初始延迟(ms)">
              <el-input-number 
                v-model="localUpstream.reconnect.initialDelayMs" 
                :min="100" 
                :max="60000"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="最大延迟(ms)">
              <el-input-number 
                v-model="localUpstream.reconnect.maxDelayMs" 
                :min="1000" 
                :max="300000"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="重试倍数">
              <el-input-number 
                v-model="localUpstream.reconnect.factor" 
                :min="1" 
                :max="10" 
                :precision="1"
              />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="最大重试次数">
              <el-input-number 
                v-model="maxRetries" 
                :min="1" 
                :max="100"
                @change="updateMaxRetries"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="心跳间隔(ms)">
              <el-input-number 
                v-model="localUpstream.reconnect.heartbeatMs" 
                :min="1000" 
                :max="60000"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </template>
    </el-form>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import type { UpstreamConfig } from '@shared/types/system';

const props = defineProps<{
  visible: boolean;
  upstream: UpstreamConfig | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:upstream': [value: UpstreamConfig | null];
  'save': [upstream: UpstreamConfig];
}>();

const formRef = ref<FormInstance>();
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

const isEdit = computed(() => !!props.upstream?.name);

const localUpstream = ref<UpstreamConfig>({
  name: '',
  transport: 'stdio',
  command: '',
  enabled: true,
});

const argsText = ref('');
const headersText = ref('{}');
const reconnectEnabled = ref(false);
const maxRetries = ref(5);

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入上游服务名称', trigger: 'blur' },
  ],
  transport: [
    { required: true, message: '请选择传输方式', trigger: 'change' },
  ],
  command: [
    { 
      required: true, 
      message: '请输入执行命令', 
      trigger: 'blur',
      validator: (rule, value, callback) => {
        if (localUpstream.value.transport === 'stdio' && !value) {
          callback(new Error('STDIO传输方式需要指定命令'));
        } else {
          callback();
        }
      }
    },
  ],
  url: [
    { 
      required: true, 
      message: '请输入服务地址', 
      trigger: 'blur',
      validator: (rule, value, callback) => {
        if (localUpstream.value.transport !== 'stdio' && !value) {
          callback(new Error('HTTP/SSE/WS传输方式需要指定URL'));
        } else {
          callback();
        }
      }
    },
  ],
};

const onTransportChange = () => {
  // 清理不相关的字段
  if (localUpstream.value.transport === 'stdio') {
    delete (localUpstream.value as any).url;
    delete (localUpstream.value as any).headers;
    delete (localUpstream.value as any).auth;
  } else {
    delete (localUpstream.value as any).command;
    delete (localUpstream.value as any).args;
    delete (localUpstream.value as any).cwd;
    delete (localUpstream.value as any).env;
  }
};

const updateArgs = () => {
  if (localUpstream.value.transport === 'stdio') {
    (localUpstream.value as any).args = argsText.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);
  }
};

const updateHeaders = () => {
  if (localUpstream.value.transport !== 'stdio') {
    try {
      (localUpstream.value as any).headers = JSON.parse(headersText.value || '{}');
    } catch (error) {
      ElMessage.warning('请求头格式不正确，请使用有效的JSON格式');
    }
  }
};

const updateReconnectConfig = () => {
  if (reconnectEnabled.value) {
    localUpstream.value.reconnect = {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      factor: 2,
      maxRetries: 5,
      heartbeatMs: 30000,
    };
  } else {
    delete localUpstream.value.reconnect;
  }
};

const updateMaxRetries = () => {
  if (localUpstream.value.reconnect) {
    localUpstream.value.reconnect.maxRetries = maxRetries.value;
  }
};

const handleClose = () => {
  dialogVisible.value = false;
};

const handleSave = async () => {
  if (!formRef.value) return;
  
  try {
    const valid = await formRef.value.validate();
    if (!valid) return;
    
    emit('save', { ...localUpstream.value });
  } catch (error) {
    console.error('Form validation failed:', error);
  }
};

watch(() => props.upstream, (newUpstream) => {
  if (newUpstream) {
    localUpstream.value = { ...newUpstream };
    
    // 初始化表单数据
    if (newUpstream.transport === 'stdio') {
      argsText.value = ((newUpstream as any).args || []).join('\n');
    } else {
      headersText.value = JSON.stringify((newUpstream as any).headers || {}, null, 2);
    }
    
    reconnectEnabled.value = !!newUpstream.reconnect?.enabled;
    maxRetries.value = newUpstream.reconnect?.maxRetries as number || 5;
  }
}, { immediate: true });
</script>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
