import { api } from "@repo/backend";
import { usePaginatedQuery } from "convex/react";

export function usePaginatedActionLogs(enabled: boolean) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.actionLog.loadUserActionLogs,
    enabled ? {} : "skip",
    { initialNumItems: 5 },
  );

  return {
    logs: results || [],
    status,
    loadMore: () => loadMore(5),
    isLoading: status === "LoadingFirstPage",
    canLoadMore: status === "CanLoadMore",
    isLoadingMore: status === "LoadingMore",
  };
}
