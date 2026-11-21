export interface TmdbDiscoverMovie {
  id: number;
  title?: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  release_date?: string;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

export interface TmdbMovieDetail extends TmdbDiscoverMovie {
  homepage?: string | null;
  budget?: number;
  revenue?: number;
  status?: string;
  video?: boolean;
  origin_country?: string[];
  external_ids?: {
    imdb_id?: string | null;
  };
}

export interface TmdbMovieCandidate {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  titleVi: string | null;
  overview: string;
  overviewVi: string | null;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  homepage: string | null;
  originCountry: string | null;
  originalLanguage: string | null;
  budget: number;
  revenue: number;
  status: string | null;
  video: boolean;
  tmdbRating: number | null;
  voteAverage: number | null;
  voteCount: number;
  genres: Array<{ id: number; name: string }>;
}
