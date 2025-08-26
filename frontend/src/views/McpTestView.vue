<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>MCP 测试中心</span>
          <div class="header-buttons">
            <el-button @click="refreshData">刷新数据</el-button>
            <el-button type="primary" @click="runAllTests">运行所有测试</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="上游测试" name="upstream">
          <UpstreamTester 
            :upstreams="upstreams"
            @test="runUpstreamTest"
          />
        </el-tab-pane>
        
        <el-tab-pane label="工具测试" name="tools">
          <ToolTester 
            :tools="tools"
            @test="runToolTest"
          />
        </el-tab-pane>
        
        <el-tab-pane label="资源测试" name="resources">
          <ResourceTester 
            :resources="resources"
            @test="runResourceTest"
          />
        </el-tab-pane>
        
        <el-tab-pane label="提示词测试" name="prompts">
          <PromptTester 
            :prompts="prompts"
            @test="runPromptTest"
          />
        </el-tab-pane>
        
        <el-tab-pane label="测试结果" name="results">
          <TestResults :results="testResults" @clear="clearResults" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useApi } from '@/composables/useApi';
import type { 
  TestResult, 
  UpstreamTestRequest, 
  ToolTestRequest, 
  ResourceTestRequest, 
  PromptTestRequest 
} from '@shared/types/test';
import UpstreamTester from '@/components/UpstreamTester.vue';
import ToolTester from '@/components/ToolTester.vue';
import ResourceTester from '@/components/ResourceTester.vue';
import PromptTester from '@/components/PromptTester.vue';
import TestResults from '@/components/TestResults.vue';

const { get, post } = useApi();

const activeTab = ref('upstream');
const upstreams = ref<any[]>([]);
const tools = ref<any[]>([]);
const resources = ref<any[]>([]);
const prompts = ref<any[]>([]);
const testResults = ref<Array<TestResult & { type: string; name: string; timestamp: number }>>([]);

const refreshData = async () => {
  try {
    // 获取上游状态
    const upstreamRes = await get('/api/upstreams/status');
    const upstreamData = await upstreamRes.json();
    upstreams.value = upstreamData.upstreams || [];

    // 获取工具列表
    const toolsRes = await get('/api/tools');
    const toolsData = await toolsRes.json();
    tools.value = toolsData.tools || [];

    ElMessage.success('数据已刷新');
  } catch (error) {
    ElMessage.error(`刷新数据失败: ${String(error)}`);
  }
};

const runUpstreamTest = async (request: UpstreamTestRequest) => {
  try {
    const response = await post('/api/test/upstream', request);
    const result: TestResult = await response.json();
    
    testResults.value.unshift({
      ...result,
      type: 'upstream',
      name: `${request.upstreamName} - ${request.testType}`,
      timestamp: Date.now(),
    });
    
    if (result.success) {
      ElMessage.success(`上游测试成功: ${result.message}`);
    } else {
      ElMessage.error(`上游测试失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`测试请求失败: ${String(error)}`);
  }
};

const runToolTest = async (request: ToolTestRequest) => {
  try {
    const response = await post('/api/test/tool', request);
    const result: TestResult = await response.json();
    
    testResults.value.unshift({
      ...result,
      type: 'tool',
      name: request.toolName,
      timestamp: Date.now(),
    });
    
    if (result.success) {
      ElMessage.success(`工具测试成功: ${result.message}`);
    } else {
      ElMessage.error(`工具测试失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`测试请求失败: ${String(error)}`);
  }
};

const runResourceTest = async (request: ResourceTestRequest) => {
  try {
    const response = await post('/api/test/resource', request);
    const result: TestResult = await response.json();
    
    testResults.value.unshift({
      ...result,
      type: 'resource',
      name: request.resourceUri,
      timestamp: Date.now(),
    });
    
    if (result.success) {
      ElMessage.success(`资源测试成功: ${result.message}`);
    } else {
      ElMessage.error(`资源测试失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`测试请求失败: ${String(error)}`);
  }
};

const runPromptTest = async (request: PromptTestRequest) => {
  try {
    const response = await post('/api/test/prompt', request);
    const result: TestResult = await response.json();
    
    testResults.value.unshift({
      ...result,
      type: 'prompt',
      name: request.promptName,
      timestamp: Date.now(),
    });
    
    if (result.success) {
      ElMessage.success(`提示词测试成功: ${result.message}`);
    } else {
      ElMessage.error(`提示词测试失败: ${result.message}`);
    }
  } catch (error) {
    ElMessage.error(`测试请求失败: ${String(error)}`);
  }
};

const runAllTests = async () => {
  ElMessage.info('开始运行所有测试...');
  
  // 测试所有上游连接
  for (const upstream of upstreams.value) {
    await runUpstreamTest({
      upstreamName: upstream.name,
      testType: 'connection',
    });
  }
  
  ElMessage.success('所有测试已完成');
};

const clearResults = () => {
  testResults.value = [];
  ElMessage.success('测试结果已清空');
};

onMounted(refreshData);
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
