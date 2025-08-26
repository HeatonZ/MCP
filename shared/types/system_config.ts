export type SystemConfig = {
  backendUrl: string;
  environment: 'development' | 'production' | 'testing';
  apiTimeout: number;
  enableDebug: boolean;
};

export type SystemConfigUpdate = Partial<SystemConfig>;
