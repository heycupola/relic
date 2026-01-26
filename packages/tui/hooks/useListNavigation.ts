import { useCallback, useEffect, useRef, useState } from "react";

interface UseListNavigationOptions<T> {
  items: T[];
  pageSize?: number;
  onSelect?: (index: number) => void;
}

export function useListNavigation<T>({
  items,
  pageSize = 10,
  onSelect,
}: UseListNavigationOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(0);
    }
  }, [items.length, selectedIndex]);

  const moveUp = useCallback(() => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : items.length - 1;
      setScrollOffset((currentOffset) => {
        if (next < currentOffset) return next;
        if (next >= currentOffset + pageSize) return Math.max(0, items.length - pageSize);
        return currentOffset;
      });
      return next;
    });
  }, [items.length, pageSize]);

  const moveDown = useCallback(() => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev < items.length - 1 ? prev + 1 : 0;
      setScrollOffset((currentOffset) => {
        if (next >= currentOffset + pageSize) return next - pageSize + 1;
        if (next < currentOffset) return 0;
        return currentOffset;
      });
      return next;
    });
  }, [items.length, pageSize]);

  const select = useCallback(() => {
    if (items.length > 0 && onSelectRef.current) {
      onSelectRef.current(selectedIndex);
    }
  }, [selectedIndex, items.length]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, []);

  return {
    selectedIndex,
    scrollOffset,
    moveUp,
    moveDown,
    select,
    reset,
    visibleItems: items.slice(scrollOffset, scrollOffset + pageSize),
    hasMore: {
      above: scrollOffset > 0,
      below: scrollOffset + pageSize < items.length,
      aboveCount: scrollOffset,
      belowCount: Math.max(0, items.length - (scrollOffset + pageSize)),
    },
  };
}
