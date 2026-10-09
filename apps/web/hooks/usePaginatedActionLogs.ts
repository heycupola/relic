import { api } from "@repo/backend";
import { usePaginatedQuery } from "convex/react";

const PAGE_SIZE = 15;

export function usePaginatedActionLogs(enabled: boolean) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.actionLog.loadUserActionLogs,
    enabled ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  return {
    logs: results || [],
    status,
    loadMore: () => loadMore(PAGE_SIZE),
    isLoading: status === "LoadingFirstPage",
    canLoadMore: status === "CanLoadMore",
    isLoadingMore: status === "LoadingMore",
  };
}
