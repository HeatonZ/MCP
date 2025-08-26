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

// 检查是否在开发环境
const isDevelopment = () => {
  return import.meta.env.DEV || systemConfig.value.environment === 'development';
};

// 创建带认证的fetch请求
const createAuthenticatedFetch = (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  
  // 在开发环境使用相对URL以利用Vite代理，生产环境使用完整URL
  let fullUrl: string;
  if (isDevelopment() && url.startsWith('/api')) {
    // 开发环境：使用相对URL，让Vite代理处理
    fullUrl = url;
  } else if (url.startsWith('http')) {
    // 已经是完整URL
    fullUrl = url;
  } else {
    // 生产环境：使用配置的后端地址
    const baseUrl = systemConfig.value.backendUrl.replace(/\/$/, '');
    fullUrl = `${baseUrl}${url}`;
  }
  
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
    // 在开发环境使用相对URL以利用Vite代理，生产环境使用完整URL
    let fullUrl: string;
    if (isDevelopment() && url.startsWith('/api')) {
      // 开发环境：使用相对URL，让Vite代理处理
      fullUrl = url;
    } else if (url.startsWith('http')) {
      // 已经是完整URL
      fullUrl = url;
    } else {
      // 生产环境：使用配置的后端地址
      const baseUrl = systemConfig.value.backendUrl.replace(/\/$/, '');
      fullUrl = `${baseUrl}${url}`;
    }
    
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
