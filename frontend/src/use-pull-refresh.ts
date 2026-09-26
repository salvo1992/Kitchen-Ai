import { useCallback, useState } from "react";

/** Pull-to-refresh state decoupled from background polling (isFetching). */
export function usePullRefresh(refetch: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);
  return { refreshing, onRefresh };
}
