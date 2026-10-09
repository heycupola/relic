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
    const lastIndex = Math.max(0, items.length - 1);
    const clampedIndex = Math.min(selectedIndex, lastIndex);
    if (clampedIndex !== selectedIndex) setSelectedIndex(clampedIndex);

    const maxOffset = Math.max(0, items.length - pageSize);
    setScrollOffset((offset) => {
      let next = Math.min(offset, maxOffset);
      if (clampedIndex < next) next = clampedIndex;
      if (clampedIndex >= next + pageSize) next = clampedIndex - pageSize + 1;
      return Math.max(0, next);
    });
  }, [items.length, selectedIndex, pageSize]);

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
      onSelectRef.current(Math.min(selectedIndex, items.length - 1));
    }
  }, [selectedIndex, items.length]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, []);

  return {
    selectedIndex: Math.min(selectedIndex, Math.max(0, items.length - 1)),
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
