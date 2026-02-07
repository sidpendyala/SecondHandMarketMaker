"use client";

import { useState } from "react";
import { Search, TrendingUp, Loader2, ShoppingCart, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

type Mode = "buy" | "sell";

interface SearchHeaderProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export default function SearchHeader({
  onSearch,
  isLoading,
  mode,
  onModeChange,
}: SearchHeaderProps) {
  const [query, setQuery] = useState("");

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
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-4 pb-16 pt-20 sm:px-6 lg:px-8">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        {/* Logo / Brand */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
          <TrendingUp className="h-4 w-4" />
          AI-Powered Deal Intelligence
        </div>

        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Market
          <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Maker
          </span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-400">
          {mode === "buy"
            ? "Find underpriced deals before anyone else. Our AI agents scan sold history, calculate true market value, and surface arbitrage opportunities."
            : "Price your items to sell fast and maximize profit. Get fee breakdowns and market-backed pricing tiers."}
        </p>

        {/* Buy / Sell Toggle */}
        <div className="mb-8 inline-flex items-center rounded-xl border border-slate-700/50 bg-slate-800/60 p-1 backdrop-blur-xl">
          <button
            onClick={() => onModeChange("buy")}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
              mode === "buy"
                ? "bg-emerald-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            Buy
          </button>
          <button
            onClick={() => onModeChange("sell")}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ${
              mode === "sell"
                ? "bg-amber-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <DollarSign className="h-4 w-4" />
            Sell
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div
            className={`group relative flex items-center rounded-2xl border bg-slate-800/60 shadow-2xl shadow-black/20 backdrop-blur-xl transition-all ${
              mode === "sell"
                ? "border-slate-700/50 focus-within:border-amber-500/50 focus-within:shadow-amber-500/10"
                : "border-slate-700/50 focus-within:border-emerald-500/50 focus-within:shadow-emerald-500/10"
            }`}
          >
            <Search
              className={`ml-5 h-5 w-5 shrink-0 text-slate-500 transition-colors ${
                mode === "sell"
                  ? "group-focus-within:text-amber-400"
                  : "group-focus-within:text-emerald-400"
              }`}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "buy"
                  ? "What are you looking to buy?"
                  : "What are you selling?"
              }
              className="h-14 flex-1 bg-transparent px-4 text-white placeholder-slate-500 outline-none sm:h-16 sm:text-lg"
              disabled={isLoading}
            />
            <div className="pr-2">
              <Button
                type="submit"
                disabled={!query.trim() || isLoading}
                className={`h-10 rounded-xl px-6 font-semibold text-white disabled:opacity-40 sm:h-12 sm:px-8 ${
                  mode === "sell"
                    ? "bg-amber-600 hover:bg-amber-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : mode === "buy" ? (
                  "Find Deals"
                ) : (
                  "Price It"
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Quick suggestions */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-slate-600">Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                onSearch(s);
              }}
              disabled={isLoading}
              className={`rounded-full border bg-slate-800/40 px-3 py-1 text-xs text-slate-400 transition-all disabled:opacity-40 ${
                mode === "sell"
                  ? "border-slate-700/50 hover:border-amber-500/30 hover:text-amber-400"
                  : "border-slate-700/50 hover:border-emerald-500/30 hover:text-emerald-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
