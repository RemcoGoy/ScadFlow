import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | "separator";

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the viewport, flipping it when it would overflow
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const margin = 4;
    setPosition({
      left: x + width + margin > window.innerWidth ? Math.max(margin, x - width) : x,
      top: y + height + margin > window.innerHeight ? Math.max(margin, y - height) : y,
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // Arrow keys move focus between enabled items
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? index + 1 : index - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className="fixed z-[100] min-w-[170px] py-1 bg-[#131924] border border-border-figma rounded-md shadow-xl shadow-black/50 select-none font-sans"
    >
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={`sep-${i}`} className="my-1 h-px bg-border-figma" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`w-full flex items-center space-x-2 px-3 py-1 text-left text-[11px] outline-none transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              item.danger
                ? "text-red-400 hover:bg-red-500/10 focus:bg-red-500/10"
                : "text-zinc-300 hover:bg-[#1d2737] hover:text-white focus:bg-[#1d2737] focus:text-white"
            }`}
          >
            <span className="w-3 h-3 flex items-center justify-center text-zinc-500 [&>svg]:w-3 [&>svg]:h-3">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
