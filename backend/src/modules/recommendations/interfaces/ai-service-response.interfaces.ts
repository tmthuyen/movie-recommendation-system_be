import { z } from 'zod';

export interface PaginationAiService {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SimilarFromAiServiceResponse {
  result: {
    id: number;
    similarityScore: number;
    rank?: number;
    title: string;
  }[];
  pagination: PaginationAiService;
}

// zod schema for SimilarFromAiServiceResponse
export const SimilarFromAiServiceResponseSchema = z.object({
  result: z.array(
    z.object({
      id: z.number(),
      similarityScore: z.number(),
      rank: z.number().optional(),
      title: z.string(),
    }),
  ),
  pagination: z.object({
    currentPage: z.number(),
    pageSize: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});

export type SimilarFromAiServiceResponseType = z.infer<
  typeof SimilarFromAiServiceResponseSchema
>;
