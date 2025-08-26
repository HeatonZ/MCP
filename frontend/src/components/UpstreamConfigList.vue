<template>
  <div>
    <el-table :data="upstreams" style="width: 100%">
      <el-table-column prop="name" label="名称" width="150" />
      <el-table-column prop="transport" label="传输方式" width="100">
        <template #default="{ row }">
          <el-tag :type="getTransportTagType(row.transport)">
            {{ row.transport }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="namespace" label="命名空间" width="120" />
      <el-table-column prop="enabled" label="启用状态" width="100">
        <template #default="{ row }">
          <el-switch 
            v-model="row.enabled" 
            @change="emitUpdate"
            :disabled="false"
          />
        </template>
      </el-table-column>
      <el-table-column label="连接信息" min-width="200">
        <template #default="{ row }">
          <div class="connection-info">
            <template v-if="row.transport === 'stdio'">
              <span>命令: {{ row.command }}</span>
              <span v-if="row.args?.length">参数: {{ row.args.join(' ') }}</span>
            </template>
            <template v-else>
              <span>URL: {{ row.url }}</span>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="重连配置" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.reconnect?.enabled" type="success" size="small">
            已启用
          </el-tag>
          <el-tag v-else type="info" size="small">
            未启用
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row, $index }">
          <el-button size="small" @click="$emit('edit', row, $index)">
            编辑
          </el-button>
          <el-button 
            size="small" 
            type="danger" 
            @click="confirmDelete($index)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <div v-if="!upstreams?.length" class="empty-state">
      <el-empty description="暂无上游配置">
        <el-button type="primary" @click="$emit('add')">添加第一个上游</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { UpstreamConfig } from '@shared/types/system';

const props = defineProps<{
  modelValue?: UpstreamConfig[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: UpstreamConfig[]];
  'edit': [upstream: UpstreamConfig, index: number];
  'delete': [index: number];
  'add': [];
}>();

const upstreams = computed(() => props.modelValue || []);

const getTransportTagType = (transport: string) => {
  switch (transport) {
    case 'stdio': return 'primary';
    case 'http': return 'success';
    case 'sse': return 'warning';
    case 'ws': return 'info';
    default: return '';
  }
};

const emitUpdate = () => {
  emit('update:modelValue', upstreams.value);
};

const confirmDelete = async (index: number) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这个上游配置吗？',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    emit('delete', index);
  } catch {
    // 用户取消删除
  }
};
</script>

<style scoped>
.connection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.empty-state {
  padding: 40px 0;
}
</style>
