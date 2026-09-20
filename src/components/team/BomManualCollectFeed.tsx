"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FeedEntry = {
  id: string;
  partName: string;
  count: number;
  newQtyInStock: number;
};

type FeedContextValue = {
  pushEntry: (entry: { partName: string; count: number; newQtyInStock: number }) => void;
};

const FeedContext = createContext<FeedContextValue | null>(null);

export function useBomManualCollectFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useBomManualCollectFeed must be used inside BomManualCollectFeedProvider");
  return ctx;
}

/** Wraps the confirmed-checklist body so per-line "Mark collected" buttons and the scan section can share one confirmation feed at the bottom of the page. */
export function BomManualCollectFeedProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);

  function pushEntry(entry: { partName: string; count: number; newQtyInStock: number }) {
    setEntries((prev) => [{ id: `${Date.now()}-${Math.random()}`, ...entry }, ...prev]);
  }

  return (
    <FeedContext.Provider value={{ pushEntry }}>
      {children}
      {entries.length > 0 && (
        <div className="mx-auto mt-4 max-w-md space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">{entry.partName}</p>
                <p className="text-xs text-ink/50">
                  +{entry.count} marked collected · {entry.newQtyInStock} in stock now
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </FeedContext.Provider>
  );
}
