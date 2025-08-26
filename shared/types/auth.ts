export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  success: boolean;
  token?: string;
  message?: string;
};

export type AuthStatus = {
  isAuthenticated: boolean;
  username?: string;
  token?: string;
};

export type AuthUser = {
  username: string;
  role: string;
};
