"use client";

import { Copy, Download, FileText, Image, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

interface LogoContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

const isDarkTheme = () => document.documentElement.classList.contains("dark");

async function copySvg(file: string) {
  const response = await fetch(`/${file}`);
  if (!response.ok) throw new Error(`Failed to fetch ${file}`);
  await navigator.clipboard.writeText(await response.text());
}

function download(path: string) {
  const link = document.createElement("a");
  link.href = path;
  link.download = path.split("/").pop() ?? "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const MENU_ITEMS: { icon: LucideIcon; label: string; run: () => void | Promise<void> }[] = [
  {
    icon: Copy,
    label: "Copy logo as SVG",
    run: () => copySvg(isDarkTheme() ? "relic-logo-light.svg" : "relic-logo-dark.svg"),
  },
  {
    icon: FileText,
    label: "Copy wordmark as SVG",
    run: () =>
      copySvg(isDarkTheme() ? "relic-logo-wordmark-light.svg" : "relic-logo-wordmark-dark.svg"),
  },
  {
    icon: Download,
    label: "Download logo PNG",
    run: () => download(isDarkTheme() ? "/relic-logo-light.png" : "/relic-logo-dark.png"),
  },
  {
    icon: Image,
    label: "Download brand assets",
    run: () => download("/relic-brand-assets.zip"),
  },
];

export function LogoContextMenu({ x, y, onClose }: LogoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState({ x, y });
  const [activeIndex, setActiveIndex] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      x: Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN),
      y: Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN),
    });
  }, [x, y]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    itemRefs.current[0]?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onCloseRef.current();
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      previouslyFocused?.focus?.();
    };
  }, []);

  const focusItem = (index: number) => {
    const next = (index + MENU_ITEMS.length) % MENU_ITEMS.length;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keyActions: Record<string, () => void> = {
      ArrowDown: () => focusItem(activeIndex + 1),
      ArrowUp: () => focusItem(activeIndex - 1),
      Home: () => focusItem(0),
      End: () => focusItem(MENU_ITEMS.length - 1),
      Tab: onClose,
    };
    const action = keyActions[event.key];
    if (!action) return;
    if (event.key !== "Tab") event.preventDefault();
    action();
  };

  const runItem = async (item: (typeof MENU_ITEMS)[number]) => {
    try {
      await item.run();
    } catch (err) {
      console.error(`${item.label} failed:`, err);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] border-2 border-border bg-popover py-1 shadow-md"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="Logo actions"
      onKeyDown={handleKeyDown}
    >
      {MENU_ITEMS.map((item, index) => (
        <button
          key={item.label}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="menuitem"
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => void runItem(item)}
          onFocus={() => setActiveIndex(index)}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
        >
          <item.icon className="h-4 w-4" aria-hidden="true" />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
