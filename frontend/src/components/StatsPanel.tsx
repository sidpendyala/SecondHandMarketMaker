"use client";

import {
  TrendingUp,
  BarChart3,
  Target,
  ShieldCheck,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalyzeResponse } from "@/lib/types";

interface StatsPanelProps {
  data: AnalyzeResponse;
}

export default function StatsPanel({ data }: StatsPanelProps) {
  const confidenceColor = {
    high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  const stats = [
    {
      label: "Fair Market Value",
      value: `$${data.fair_value.toFixed(2)}`,
      icon: Target,
      description: "Median sold price",
      accent: "text-emerald-400",
      iconBg: "bg-emerald-500/10",
    },
    {
      label: "Average Sold",
      value: `$${data.mean_price.toFixed(2)}`,
      icon: BarChart3,
      description: `${data.sample_size} recent sales`,
      accent: "text-blue-400",
      iconBg: "bg-blue-500/10",
    },
    {
      label: "Price Range",
      value: `$${data.min_price.toFixed(0)} - $${data.max_price.toFixed(0)}`,
      icon: TrendingUp,
      description: `Std dev: $${data.std_dev.toFixed(2)}`,
      accent: "text-purple-400",
      iconBg: "bg-purple-500/10",
    },
    {
      label: "Deals Found",
      value: `${data.deals.length}`,
      icon: ShieldCheck,
      description: `of ${data.total_active} active listings`,
      accent: "text-amber-400",
      iconBg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          Market Pulse
        </h2>
        <Badge
          variant="outline"
          className={`text-xs ${confidenceColor[data.confidence]}`}
        >
          {data.confidence.toUpperCase()} CONFIDENCE
        </Badge>
        <span className="text-sm text-slate-500">
          &quot;{data.query}&quot;
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="border-slate-200 bg-white/80 backdrop-blur-sm transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/80"
          >
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {stat.label}
                </span>
                <div className={`rounded-lg p-2 ${stat.iconBg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.accent}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${stat.accent}`}>
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Best deal callout */}
      {data.deals.length > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-4 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-cyan-950/30">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                Best Deal:
              </span>
            </div>
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              {data.deals[0].title.slice(0, 60)}
              {data.deals[0].title.length > 60 ? "..." : ""}
            </span>
            <Badge className="bg-emerald-600 text-white">
              {data.deals[0].discount_pct}% BELOW MARKET
            </Badge>
            <span className="ml-auto text-lg font-bold text-emerald-700 dark:text-emerald-300">
              ${data.deals[0].price.toFixed(2)}
            </span>
            <span className="text-sm text-slate-500 line-through">
              ${data.fair_value.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
