
export interface TaggingItem {
  id: string;
  name: string;
  blob: Blob;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  tags?: string;
  error?: string;
  attempts?: number; // 记录重试次数
}

export interface PromptConfig {
  stage1: string;
  stage2: string;
  stage3: string;
}

export type EndpointType = 'google_sdk' | 'openai_compatible';

export interface Endpoint {
  id: string;
  name: string;
  type: EndpointType;
  baseUrl?: string; // 仅 OpenAI 模式需要
  apiKey: string;
  model: string;
  active: boolean;
  
  // 节点连接状态与模型列表
  availableModels?: string[];
  isChecking?: boolean;
  connectionStatus?: 'idle' | 'success' | 'error';
  connectionMessage?: string;
}

export interface RetryConfig {
  enabled: boolean;
  maxAttempts: number;
  retryIntervalMs: number;
}

export interface CompressionConfig {
  enabled: boolean;
  maxSizeMB: number;
  maxWidthOrHeight: number;
  quality: number;
}

export interface ValidationConfig {
  enabled: boolean;
  minChars: number; // 结果小于等于此长度将被丢弃并重试
}

export interface GlobalConfig {
  endpoints: Endpoint[];
  concurrency: number; // 1 = 串行, >1 = 并发
  retry: RetryConfig;
  compression: CompressionConfig;
  prompt: PromptConfig;
  validation: ValidationConfig;
}
