import { useEffect, useRef } from 'react';

export interface ReelsPanelProps {
  locked: boolean;
}

export function ReelsPanel({ locked }: ReelsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.inert = locked;
    }
  }, [locked]);

  return (
    <div ref={panelRef} data-testid="reels-panel" className="card" aria-disabled={locked}>
      <div className="card-body">Reels placeholder</div>
    </div>
  );
}
