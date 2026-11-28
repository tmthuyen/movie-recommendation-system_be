import aiAxiosClient from '@/lib/aiAxiosClient';
import axiosClient from '@/lib/axiosClient';
import type { ApiResponse } from '@/shared/types/api.types';

export type AIConfigValue = string | number | boolean | Record<string, unknown> | unknown[] | null;

export interface AIConfigItem {
  key: string;
  label: string;
  description?: string;
  type: 'float' | 'int' | 'string' | 'boolean' | 'json';
  value: AIConfigValue;
  default: AIConfigValue;
  min?: number | null;
  max?: number | null;
  source: 'redis' | 'default';
}

export interface AIConfigGroup {
  group: string;
  label: string;
  items: AIConfigItem[];
}

export interface AIConfigResult {
  version: number;
  groups: AIConfigGroup[];
}

export interface AIConfigUpdateResult {
  version: number;
  updated: string[];
}

// /**
//  * AI config đi qua gateway: `/api/ai/recommendations/admin/ai-config`.
//  * axiosClient đã có baseURL `/api`, nên path tại đây bắt đầu bằng `/ai/...`.
//  */
// export const aiConfigApi = {
//   getAll: async (): Promise<ApiResponse<AIConfigResult>> => {
//     const { data } = await axiosClient.get('/ai/recommendations/admin/ai-config');
//     return data;
//   },

//   update: async (
//     changes: Record<string, AIConfigValue>,
//   ): Promise<ApiResponse<AIConfigUpdateResult>> => {
//     const { data } = await axiosClient.post('/ai/recommendations/admin/ai-config', {
//       changes,
//     });
//     return data;
//   },
// };

export const aiConfigApi = {
  getAll: async (): Promise<ApiResponse<AIConfigResult>> => {
    const { data } = await aiAxiosClient.get('/recommendations/admin/ai-config');
    return data;
  },

  update: async (
    changes: Record<string, AIConfigValue>,
  ): Promise<ApiResponse<AIConfigUpdateResult>> => {
    const { data } = await aiAxiosClient.post('/recommendations/admin/ai-config', {
      changes,
    });
    return data;
  },
};
