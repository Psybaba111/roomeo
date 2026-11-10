import { useCallback, useEffect, useRef, useState } from "react";
import { errText } from "@/lib/ui-text";
import { runListLoad, type ListLoad } from "@/lib/ui/list-load";

/** Fetch a list once `enabled` (signed in), with reload() for retry and after actions. */
export function useListLoad<T>(fetcher: () => Promise<T[]>, enabled: boolean) {
  const [state, setState] = useState<ListLoad<T>>({ kind: "loading" });
  const live = useRef(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const reload = useCallback(() => {
    void runListLoad(() => fetchRef.current(), setState, errText, () => live.current);
  }, []);
  useEffect(() => {
    live.current = true;
    if (enabled) reload();
    return () => {
      live.current = false;
    };
  }, [enabled, reload]);
  return { state, reload };
}
