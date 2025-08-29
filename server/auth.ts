import type { LoginRequest, LoginResponse, AuthStatus } from "@shared/types/auth.ts";

// 简单的内存session存储
const sessions = new Map<string, { username: string; expires: number }>();

// 用户配置，密码从环境变量获取
const ADMIN_USER = {
  username: "admin",
  password: Deno.env.get("PASSWORD") || "admin",
  role: "admin"
};

// 生成简单的session token
function generateToken(): string {
  return crypto.randomUUID();
}

// 验证用户凭据
function validateCredentials(username: string, password: string): boolean {
  return username === ADMIN_USER.username && password === ADMIN_USER.password;
}

// 创建session
function createSession(username: string): string {
  const token = generateToken();
  const expires = Date.now() + 24 * 60 * 60 * 1000; // 24小时过期
  sessions.set(token, { username, expires });
  return token;
}

// 验证session
function validateSession(token: string): { valid: boolean; username?: string } {
  const session = sessions.get(token);
  if (!session) {
    return { valid: false };
  }
  
  if (Date.now() > session.expires) {
    sessions.delete(token);
    return { valid: false };
  }
  
  return { valid: true, username: session.username };
}

// 删除session
function deleteSession(token: string): void {
  sessions.delete(token);
}

// 清理过期session
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expires) {
      sessions.delete(token);
    }
  }
}

// 定期清理过期session
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // 每小时清理一次

// 认证中间件
export function requireAuth(req: Request): { authenticated: boolean; username?: string } {
  const authHeader = req.headers.get("Authorization");
  
  // 添加调试日志
  console.log(`🔐 Auth check - URL: ${new URL(req.url).pathname}, Auth header: ${authHeader ? 'present' : 'missing'}`);
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(`🔐 Auth failed - Invalid header format`);
    return { authenticated: false };
  }
  
  const token = authHeader.substring(7);
  const validation = validateSession(token);
  
  console.log(`🔐 Token validation - Valid: ${validation.valid}, Username: ${validation.username}`);
  
  return {
    authenticated: validation.valid,
    username: validation.username
  };
}

// 登录处理
export function handleLogin(loginData: LoginRequest): LoginResponse {
  const { username, password } = loginData;
  
  if (!validateCredentials(username, password)) {
    return {
      success: false,
      message: "用户名或密码错误"
    };
  }
  
  const token = createSession(username);
  return {
    success: true,
    token,
    message: "登录成功"
  };
}

// 登出处理
export function handleLogout(token: string): { success: boolean } {
  deleteSession(token);
  return { success: true };
}

// 获取认证状态
export function getAuthStatus(token: string): AuthStatus {
  const validation = validateSession(token);
  return {
    isAuthenticated: validation.valid,
    username: validation.username,
    token: validation.valid ? token : undefined
  };
}
