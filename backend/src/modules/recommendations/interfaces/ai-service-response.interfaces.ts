import { z } from 'zod';

/** Pagination của ai-service — khớp `api/schemas.py::Pagination`. */
export interface PaginationAiService {
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface SimilarFromAiServiceResponse {
  result: {
    id: number;
    similarityScore: number;
    rank?: number | null;
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
      rank: z.number().nullish(),
      title: z.string(),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    totalPages: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
});

export type SimilarFromAiServiceResponseType = z.infer<
  typeof SimilarFromAiServiceResponseSchema
>;

// Hybrid Recommendation Response from AI service
export interface HybridFromAiServiceResponse {
  result: {
    movie_id: number;
    rrf_score: number;
    fused_rank: number;
  }[];
  pagination: PaginationAiService;
}

// zod schema for HybridFromAiServiceResponse
export const HybridFromAiServiceResponseSchema = z.object({
  result: z.array(
    z.object({
      movie_id: z.number(),
      rrf_score: z.number(),
      fused_rank: z.number(),
    }),
  ),
  pagination: z.object({
    total: z.number(),
    totalPages: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
});

export type HybridFromAiServiceResponseType = z.infer<
  typeof HybridFromAiServiceResponseSchema
>;
