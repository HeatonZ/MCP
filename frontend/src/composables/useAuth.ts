import { ref, computed } from 'vue';
import type { LoginRequest, LoginResponse, AuthStatus } from '@shared/types/auth';
import { useApi } from './useApi';

const authToken = ref<string | null>(localStorage.getItem('auth_token'));
const authUser = ref<string | null>(localStorage.getItem('auth_user'));

export function useAuth() {
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
