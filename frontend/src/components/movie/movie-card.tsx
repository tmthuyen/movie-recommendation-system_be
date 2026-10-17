import { Film, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Movie } from '@/shared/types/movie.types';
import { getMovieTitle, getPosterUrl, getReleaseYear } from '@/shared/utils/movie';

export function MovieCard({ movie }: { movie: Movie }) {
  const poster = getPosterUrl(movie.posterPath || movie.backdropPath);
  const title = getMovieTitle(movie);
  const year = getReleaseYear(movie.releaseDate);
  const rating = typeof movie.voteAverage === 'number' ? movie.voteAverage : 0;

  return (
    <Link
      href={`/movies/${movie.id}`}
      title={title}
      className="group bg-card text-card-foreground focus-visible:ring-ring flex flex-col overflow-hidden rounded-lg border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden">
        {poster ? (
          <Image
            src={poster}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film className="size-10" />
          </div>
        )}

        {rating > 0 && (
          <span className="bg-background/85 text-foreground absolute top-2 right-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold shadow-sm backdrop-blur">
            <Star className="size-3 fill-current text-yellow-500" />
            {rating.toFixed(1)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-auto text-xs">{year || 'Đang cập nhật'}</p>
      </div>
    </Link>
  );
}
