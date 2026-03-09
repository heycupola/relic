"use client";

import { Copy, Download, FileText, Image } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LogoContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function LogoContextMenu({ x, y, onClose }: LogoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [isDarkTheme, setIsDarkTheme] = useState(false);

  useEffect(() => {
    // Adjust position if menu would go off screen
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + menuRect.width > viewportWidth) {
        adjustedX = viewportWidth - menuRect.width - 8;
      }

      if (y + menuRect.height > viewportHeight) {
        adjustedY = viewportHeight - menuRect.height - 8;
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setIsDarkTheme(mediaQuery.matches);
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  const copyLogoAsSVG = async () => {
    try {
      const logoFile = isDarkTheme ? "relic-logo-light.svg" : "relic-logo-dark.svg";
      const response = await fetch(`/${logoFile}`);
      const svgContent = await response.text();
      await navigator.clipboard.writeText(svgContent);
      onClose();
    } catch (err) {
      console.error("Failed to copy SVG:", err);
    }
  };

  const copyLogoAsWordmark = async () => {
    try {
      const wordmarkFile = isDarkTheme
        ? "relic-logo-wordmark-light.svg"
        : "relic-logo-wordmark-dark.svg";
      const response = await fetch(`/${wordmarkFile}`);
      const svgContent = await response.text();
      await navigator.clipboard.writeText(svgContent);
      onClose();
    } catch (err) {
      console.error("Failed to copy wordmark:", err);
    }
  };

  const downloadLogoPNG = () => {
    const pngFile = isDarkTheme ? "relic-logo-light.png" : "relic-logo-dark.png";
    const link = document.createElement("a");
    link.href = `/${pngFile}`;
    link.download = pngFile;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  const downloadBrandAssets = () => {
    const link = document.createElement("a");
    link.href = "/relic-brand-assets.zip";
    link.download = "relic-brand-assets.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  const menuItems = [
    {
      icon: Copy,
      label: "Copy Logo as SVG",
      onClick: copyLogoAsSVG,
    },
    {
      icon: FileText,
      label: "Copy Logo as Wordmark",
      onClick: copyLogoAsWordmark,
    },
    {
      icon: Download,
      label: "Download Logo PNG",
      onClick: downloadLogoPNG,
    },
    {
      icon: Image,
      label: "Download Brand Assets",
      onClick: downloadBrandAssets,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border border-border bg-popover shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      role="menu"
      aria-label="Logo actions menu"
    >
      <div className="py-1">
        {menuItems.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                item.onClick();
              }
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
            role="menuitem"
            tabIndex={0}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
