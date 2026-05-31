interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-spotify-highlight ${className}`}
      aria-hidden
    />
  );
}

export function TrackCardSkeleton() {
  return (
    <div className="p-4">
      <Skeleton className="mb-4 aspect-square w-full" />
      <Skeleton className="mb-2 h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-10 w-10 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

export function TrackGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <TrackCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="bg-gradient-gachi px-6 pb-6 pt-4">
      <Skeleton className="mb-4 h-4 w-32" />
      <Skeleton className="h-16 w-2/3 md:h-24" />
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 pb-6 md:flex-row md:items-end">
      <Skeleton className="h-56 w-56 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-full max-w-lg md:h-16" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
