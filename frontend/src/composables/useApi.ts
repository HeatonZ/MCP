import { ref } from 'vue';
import type { SystemConfig } from '@shared/types/system_config';

// 系统配置状态
const systemConfig = ref<SystemConfig>({
  backendUrl: 'http://localhost:8787',
  environment: 'development',
  apiTimeout: 30000,
  enableDebug: false,
});

// 从localStorage加载系统配置
const loadSystemConfig = () => {
  const saved = localStorage.getItem('system_config');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      systemConfig.value = { ...systemConfig.value, ...parsed };
    } catch (error) {
      console.error('Failed to parse saved system config:', error);
    }
  }
};

// 保存系统配置到localStorage
const saveSystemConfig = (config: Partial<SystemConfig>) => {
  systemConfig.value = { ...systemConfig.value, ...config };
  localStorage.setItem('system_config', JSON.stringify(systemConfig.value));
};

// 获取认证token
const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};

// 创建带认证的fetch请求
const createAuthenticatedFetch = (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const baseUrl = systemConfig.value.backendUrl.replace(/\/$/, ''); // 移除末尾斜杠
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // 添加认证头
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), systemConfig.value.apiTimeout);
  
  const fetchPromise = fetch(fullUrl, {
    ...options,
    headers,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
  
  if (systemConfig.value.enableDebug) {
    console.log(`API Request: ${options.method || 'GET'} ${fullUrl}`, {
      headers,
      body: options.body,
    });
  }
  
  return fetchPromise;
};

// API客户端方法
export function useApi() {
  // 初始化时加载配置
  loadSystemConfig();
  
  const get = async (url: string) => {
    return createAuthenticatedFetch(url, { method: 'GET' });
  };
  
  const post = async (url: string, data?: unknown) => {
    return createAuthenticatedFetch(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  };
  
  const put = async (url: string, data?: unknown) => {
    return createAuthenticatedFetch(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  };
  
  const del = async (url: string) => {
    return createAuthenticatedFetch(url, { method: 'DELETE' });
  };
  
  // 不需要认证的请求（用于登录等）
  const publicRequest = async (url: string, options: RequestInit = {}) => {
    const baseUrl = systemConfig.value.backendUrl.replace(/\/$/, '');
    const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), systemConfig.value.apiTimeout);
    
    return fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });
  };
  
  return {
    get,
    post,
    put,
    delete: del,
    publicRequest,
    systemConfig: systemConfig.value,
    updateSystemConfig: saveSystemConfig,
    getBackendUrl: () => systemConfig.value.backendUrl,
  };
}
