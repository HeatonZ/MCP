import { ref, computed } from 'vue';
import type { LoginRequest, LoginResponse, AuthStatus } from '@shared/types/auth';
import { useApi } from './useApi';

// 延迟初始化，避免SSR问题
const authToken = ref<string | null>(null);
const authUser = ref<string | null>(null);

// 初始化函数
const initializeAuth = () => {
  if (typeof window !== 'undefined') {
    authToken.value = localStorage.getItem('auth_token');
    authUser.value = localStorage.getItem('auth_user');
  }
};

export function useAuth() {
  // 确保认证状态已初始化
  if (authToken.value === null && typeof window !== 'undefined') {
    initializeAuth();
  }
  
  const { publicRequest, get } = useApi();
  const isAuthenticated = computed(() => !!authToken.value);
  
  const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      const response = await publicRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      
      const result: LoginResponse = await response.json();
      
      if (result.success && result.token) {
        authToken.value = result.token;
        authUser.value = credentials.username;
        localStorage.setItem('auth_token', result.token);
        localStorage.setItem('auth_user', credentials.username);
        
        // 调试信息
        console.log('🔑 Login successful, token saved:', {
          token: result.token.substring(0, 8) + '...',
          localStorage: localStorage.getItem('auth_token')?.substring(0, 8) + '...',
          authTokenValue: authToken.value?.substring(0, 8) + '...'
        });
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `登录失败: ${String(error)}`,
      };
    }
  };
  
  const logout = async (): Promise<void> => {
    try {
      if (authToken.value) {
        await publicRequest('/api/auth/logout', {
          method: 'POST',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      authToken.value = null;
      authUser.value = null;
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    }
  };
  
  const checkAuthStatus = async (): Promise<boolean> => {
    if (!authToken.value) {
      return false;
    }
    
    try {
      const response = await get('/api/auth/status');
      const status: AuthStatus = await response.json();
      
      if (!status.isAuthenticated) {
        await logout();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Auth status check failed:', error);
      await logout();
      return false;
    }
  };
  
  const getAuthHeaders = () => {
    return authToken.value ? {
      'Authorization': `Bearer ${authToken.value}`,
    } : {};
  };
  
  return {
    isAuthenticated,
    authUser: computed(() => authUser.value),
    login,
    logout,
    checkAuthStatus,
    getAuthHeaders,
  };
}
