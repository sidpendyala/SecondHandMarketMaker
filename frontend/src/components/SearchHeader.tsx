"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useTextScramble } from "@/hooks/useTextScramble";
import BubbleText from "@/components/BubbleText";

type Mode = "buy" | "sell";

interface SearchHeaderProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  externalQuery?: string;
  /** Called when the logo/title is clicked — reset to home/default state */
  onHomeClick?: () => void;
  /** Increment to force-clear the search input (e.g. on home click when externalQuery didn't change) */
  clearTrigger?: number;
}

export default function SearchHeader({
  onSearch,
  isLoading,
  mode,
  onModeChange,
  externalQuery,
  onHomeClick,
  clearTrigger,
}: SearchHeaderProps) {
  const [query, setQuery] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const placeholderText =
    mode === "buy"
      ? "Enter product to scan..."
      : "Enter product to price...";
  const { display: placeholderDisplay } = useTextScramble(placeholderText, mode, {
    stepInterval: 40,
    scrambleInterval: 35,
    runOnMount: true,
  });

  useEffect(() => {
    if (externalQuery === undefined) {
      setQuery("");
    } else if (externalQuery !== query) {
      setQuery(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  useEffect(() => {
    if (clearTrigger !== undefined && clearTrigger > 0) {
      setQuery("");
    }
  }, [clearTrigger]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  };

  const suggestions = [
    "Sony WH-1000XM4",
    "MacBook Pro M2",
    "Nintendo Switch OLED",
    "iPad Air 5th Gen",
    "AirPods Pro 2",
  ];

  return (
    <div className="border-b border-[#2a2520] bg-black px-4 py-3 transition-colors duration-[var(--transition-normal)]">
      <div className="mx-auto max-w-6xl">
        {/* Top row: brand (home) + mode tabs */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onHomeClick}
              className="text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#39ff14]/50 focus:ring-offset-0"
              aria-label="Go to home"
            >
              <BubbleText text="SECOND HAND MARKETMAKER" className="text-sm" />
            </button>
            <span className="text-xs text-[#6b6560]">
              AI DEAL INTELLIGENCE
            </span>
          </div>

          {/* Tubelight-style BUY / SELL tabs (neon glow on active, sliding pill) */}
          <div className="relative flex rounded-sm border border-[#2a2520] bg-[#0d0b09] p-0.5">
            <div
              className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-[2px] bg-[#39ff14] transition-[transform] duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
              style={{
                boxShadow:
                  "0 0 12px 3px rgba(57, 255, 20, 0.45), 0 0 24px 2px rgba(57, 255, 20, 0.2)",
                transform: mode === "sell" ? "translateX(100%)" : "translateX(0)",
              }}
              aria-hidden
            />
            <button
              onClick={() => onModeChange("buy")}
              className={`relative z-10 w-14 py-1.5 text-xs font-bold tracking-wide transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                mode === "buy"
                  ? "text-black"
                  : "text-[#6b6560] hover:text-[#e8e6e3]"
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => onModeChange("sell")}
              className={`relative z-10 w-14 py-1.5 text-xs font-bold tracking-wide transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                mode === "sell"
                  ? "text-black"
                  : "text-[#6b6560] hover:text-[#e8e6e3]"
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Command-line search bar */}
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center border border-[#2a2520] bg-[#0d0b09]">
            <span className="px-3 text-xs text-[#39ff14]">
              {mode === "buy" ? "FIND>" : "SELL>"}
            </span>
            <div className="relative h-9 flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                aria-label={placeholderText}
                className="h-full w-full bg-transparent py-2 pr-2 text-sm text-[#e8e6e3] outline-none"
                disabled={isLoading}
              />
              {/* Text scramble placeholder: show when empty and (first load or mode just switched) */}
              {!query.trim() && !inputFocused && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center py-2 pl-1 pr-2 text-sm text-[#6b6560]"
                  aria-hidden
                >
                  <span className="truncate">{placeholderDisplay}</span>
                </div>
              )}
            </div>
            <span className="rainbow-button-wrapper h-9">
              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="rainbow-button-inner flex h-full w-full items-center justify-center gap-1.5 bg-[#0d0b09] px-4 text-xs font-bold text-[#39ff14] transition-colors hover:bg-[#1a1714] hover:text-[#39ff14] disabled:bg-[#1a1714] disabled:opacity-30 disabled:text-[#6b6560]"
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "GO"
                )}
              </button>
            </span>
          </div>
        </form>

        {/* Example search buttons (gradient-button style) */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] text-[#6b6560]">
            Examples:
          </span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                onSearch(s);
              }}
              disabled={isLoading}
              className="group relative rounded-md px-2.5 py-1 text-[10px] font-medium transition-all duration-200 disabled:opacity-30"
              style={{
                background:
                  "linear-gradient(135deg, #0f1410 0%, #1a2518 50%, #0d130c 100%)",
                color: "#8fa88a",
                boxShadow:
                  "inset 0 1px 0 rgba(57, 255, 20, 0.06), 0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              <span className="relative z-10 transition-colors duration-200 group-hover:text-[#39ff14] group-disabled:group-hover:text-[#8fa88a]">
                {s.toUpperCase()}
              </span>
              <span
                className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-disabled:opacity-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(57, 255, 20, 0.12) 0%, rgba(45, 143, 15, 0.08) 50%, rgba(57, 255, 20, 0.06) 100%)",
                  boxShadow: "0 0 12px rgba(57, 255, 20, 0.15)",
                }}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
