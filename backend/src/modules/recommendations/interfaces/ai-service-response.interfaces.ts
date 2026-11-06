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
