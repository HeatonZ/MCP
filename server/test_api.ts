import type { TestResult, UpstreamTestRequest, ToolTestRequest, ResourceTestRequest, PromptTestRequest } from "@shared/types/test.ts";
import { getAllTools } from "@server/tools.ts";
import { listAggregatedResources, readAggregatedResource, listAggregatedPrompts, getAggregatedPrompt } from "@server/upstream/index.ts";

// 测试上游连接
export async function testUpstreamConnection(request: UpstreamTestRequest): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    switch (request.testType) {
      case 'connection':
        // 通过尝试获取工具列表来测试连接
        try {
          const allResources = await listAggregatedResources();
          const hasUpstream = allResources.some(r => r.upstream === request.upstreamName);
          return {
            success: hasUpstream,
            message: hasUpstream ? "连接正常" : "连接失败或无数据",
            data: { connected: hasUpstream },
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            success: false,
            message: `连接测试失败: ${String(error)}`,
            duration: Date.now() - startTime
          };
        }
        
      case 'tools':
        // 测试工具列表 - 通过聚合工具列表获取
        const allTools = await getAllTools();
        const upstreamTools = allTools.filter(t => t.name.startsWith(`${request.upstreamName}/`));
        return {
          success: true,
          message: `获取到 ${upstreamTools.length} 个工具`,
          data: { tools: upstreamTools.map(t => ({ name: t.name, title: t.title, description: t.description })) },
          duration: Date.now() - startTime
        };
        
      case 'resources':
        // 测试资源列表
        const allResources = await listAggregatedResources();
        const upstreamResources = allResources.filter(r => r.upstream === request.upstreamName);
        return {
          success: true,
          message: `获取到 ${upstreamResources.length} 个资源`,
          data: { resources: upstreamResources },
          duration: Date.now() - startTime
        };
        
      case 'prompts':
        // 测试提示词列表
        const allPrompts = await listAggregatedPrompts();
        const upstreamPrompts = allPrompts.filter(p => p.upstream === request.upstreamName);
        return {
          success: true,
          message: `获取到 ${upstreamPrompts.length} 个提示词`,
          data: { prompts: upstreamPrompts },
          duration: Date.now() - startTime
        };
        
      default:
        return {
          success: false,
          message: "不支持的测试类型",
          duration: Date.now() - startTime
        };
    }
  } catch (error) {
    return {
      success: false,
      message: `测试失败: ${String(error)}`,
      duration: Date.now() - startTime
    };
  }
}

// 测试工具调用
export async function testToolCall(request: ToolTestRequest): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const tools = await getAllTools();
    const tool = tools.find(t => t.name === request.toolName);
    
    if (!tool) {
      return {
        success: false,
        message: `工具 "${request.toolName}" 未找到`,
        duration: Date.now() - startTime
      };
    }
    
    const result = await tool.handler(request.args || {});
    
    return {
      success: !result.isError,
      message: result.isError ? "工具调用失败" : "工具调用成功",
      data: { result: result.text, isError: result.isError },
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      message: `工具测试失败: ${String(error)}`,
      duration: Date.now() - startTime
    };
  }
}

// 测试资源读取
export async function testResourceRead(request: ResourceTestRequest): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // 解析资源URI，确定是否为上游资源
    const uri = request.resourceUri;
    
    if (uri.startsWith('upstream://')) {
      // 上游资源
      const parts = uri.replace('upstream://', '').split('/');
      if (parts.length < 2) {
        return {
          success: false,
          message: "无效的上游资源URI格式",
          duration: Date.now() - startTime
        };
      }
      
      const upstreamName = parts[0];
      const encodedOriginalUri = parts.slice(1).join('/');
      
      try {
        const originalUri = (globalThis as unknown as { atob?: (s: string) => string }).atob?.(encodedOriginalUri) ?? encodedOriginalUri;
        const result = await readAggregatedResource(upstreamName, originalUri);
        
        return {
          success: true,
          message: `成功读取资源，获得 ${result.contents?.length || 0} 个内容项`,
          data: result,
          duration: Date.now() - startTime
        };
      } catch (error) {
        return {
          success: false,
          message: `读取上游资源失败: ${String(error)}`,
          duration: Date.now() - startTime
        };
      }
    } else {
      // 本地资源 - 这里可以扩展本地资源的测试逻辑
      return {
        success: false,
        message: "暂不支持本地资源测试",
        duration: Date.now() - startTime
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `资源测试失败: ${String(error)}`,
      duration: Date.now() - startTime
    };
  }
}

// 测试提示词获取
export async function testPromptGet(request: PromptTestRequest): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const prompts = await listAggregatedPrompts();
    const prompt = prompts.find(p => p.name === request.promptName || `${p.namespace}/${p.name}` === request.promptName);
    
    if (!prompt) {
      return {
        success: false,
        message: `提示词 "${request.promptName}" 未找到`,
        duration: Date.now() - startTime
      };
    }
    
    const result = await getAggregatedPrompt(prompt.upstream, prompt.name, request.args || {});
    
    return {
      success: true,
      message: `成功获取提示词，包含 ${result.messages?.length || 0} 条消息`,
      data: result,
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      message: `提示词测试失败: ${String(error)}`,
      duration: Date.now() - startTime
    };
  }
}
