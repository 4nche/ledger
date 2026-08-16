'use client';

import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { TableRow } from '@/components/ui/table';

/**
 * A table row that navigates when clicked.
 *
 * The obvious alternative — a link stretched over the row with
 * `after:absolute after:inset-0` — puts an invisible overlay across every cell,
 * which makes the row impossible to inspect in devtools: the pointer always
 * lands on the overlay rather than the cell underneath. Handling the click here
 * leaves the DOM exactly as it reads.
 *
 * What a plain onClick would otherwise lose is restored explicitly:
 *
 *   - modifier-click and middle-click open a new tab, as on any link;
 *   - the symbol cell keeps a real anchor, so keyboard users reach the position
 *     by tabbing and the browser shows the URL on hover.
 *
 * The row itself is deliberately not focusable. It would add a second tab stop
 * per row that goes exactly where the symbol link already goes.
 */
export function LinkedRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function navigate(event: MouseEvent<HTMLTableRowElement>, newTab: boolean): void {
    // Never hijack a click that was aimed at something already interactive.
    if (
      (event.target as HTMLElement).closest('a, button, input, select, textarea, [role="button"]')
    ) {
      return;
    }
    // Let a text selection stand rather than navigating out from under it.
    if ((window.getSelection()?.toString().length ?? 0) > 0) {
      return;
    }

    if (newTab) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(href);
    }
  }

  return (
    <TableRow
      className={className}
      onClick={(event) => navigate(event, event.metaKey || event.ctrlKey || event.shiftKey)}
      onAuxClick={(event) => {
        if (event.button === 1) navigate(event, true);
      }}
    >
      {children}
    </TableRow>
  );
}
