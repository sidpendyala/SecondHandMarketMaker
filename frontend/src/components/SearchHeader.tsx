"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

type Mode = "buy" | "sell";

interface SearchHeaderProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  externalQuery?: string;
  /** Called when the logo/title is clicked — reset to home/default state */
  onHomeClick?: () => void;
}

export default function SearchHeader({
  onSearch,
  isLoading,
  mode,
  onModeChange,
  externalQuery,
  onHomeClick,
}: SearchHeaderProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (externalQuery === undefined) {
      setQuery("");
    } else if (externalQuery !== query) {
      setQuery(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

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
    <div className="border-b border-[#2a2520] bg-black px-4 py-3">
      <div className="mx-auto max-w-6xl">
        {/* Top row: brand (home) + mode tabs */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onHomeClick}
              className="flex items-center gap-3 text-left transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#39ff14]/50 focus:ring-offset-0"
              aria-label="Go to home"
            >
              <span className="text-sm font-bold text-[#39ff14]">
                SECOND HAND MARKETMAKER
              </span>
            </button>
          </div>

          <div className="flex items-center gap-px">
            <button
              onClick={() => onModeChange("buy")}
              className={`px-3 py-1 text-xs font-bold tracking-wide transition-colors ${
                mode === "buy"
                  ? "bg-[#39ff14] text-black"
                  : "bg-[#1a1714] text-[#6b6560] hover:text-[#e8e6e3]"
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => onModeChange("sell")}
              className={`px-3 py-1 text-xs font-bold tracking-wide transition-colors ${
                mode === "sell"
                  ? "bg-[#39ff14] text-black"
                  : "bg-[#1a1714] text-[#6b6560] hover:text-[#e8e6e3]"
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Command-line search bar */}
        <form onSubmit={handleSubmit}>
          <div className="flex items-center border border-[#2a2520] bg-[#0d0b09]">
            <span className="px-3 text-xs text-[#39ff14]">
              {mode === "buy" ? "FIND>" : "SELL>"}
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "buy"
                  ? "Enter product to scan..."
                  : "Enter product to price..."
              }
              className="h-9 flex-1 bg-transparent text-sm text-[#e8e6e3] placeholder-[#6b6560] outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!query.trim() || isLoading}
              className="flex h-9 items-center gap-1.5 bg-[#39ff14] px-4 text-xs font-bold text-black transition-colors hover:bg-[#32cd32] disabled:opacity-30"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "GO"
              )}
            </button>
          </div>
        </form>

        {/* Example search buttons */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
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
              className="border border-[#2a2520] bg-[#0d0b09] px-2 py-0.5 text-[10px] text-[#6b6560] transition-colors hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-30"
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
