import { apiGet } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HealthResponse {
  readonly status: string;
  readonly reportingTimeZone: string;
}

/**
 * Proves the web → API → PostgreSQL round-trip on every page load. A dot rather
 * than a banner: it should be reassuring when green and impossible to miss when
 * red, without taking space from the data.
 */
export async function ApiStatus() {
  let health: HealthResponse | null = null;
  let failure: string | null = null;

  try {
    health = await apiGet<HealthResponse>('/health');
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown error';
  }

  const online = health?.status === 'ok';

  return (
    <Tooltip>
      <TooltipTrigger
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
        aria-label={online ? 'API connected' : 'API unreachable'}
      >
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-red-500')}
        />
        <span className="hidden sm:inline">
          {online ? health?.reportingTimeZone : 'API offline'}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {online ? (
          <span>API connected. Reporting timezone {health?.reportingTimeZone}.</span>
        ) : (
          <span>{failure ?? 'The API did not report healthy.'}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
