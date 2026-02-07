"use client";

import type { AnalyzeResponse } from "@/lib/types";

interface StatsPanelProps {
  data: AnalyzeResponse;
}

export default function StatsPanel({ data }: StatsPanelProps) {
  const confColor = {
    high: "text-[#33cc33]",
    medium: "text-[#32cd32]",
    low: "text-[#ff3333]",
  };

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Header bar */}
      <div className="mb-2 flex items-center gap-3 border-b border-[#2a2520] pb-2">
        <span className="text-xs font-bold text-[#39ff14]">MARKET PULSE</span>
        <span className={`text-[10px] font-bold ${confColor[data.confidence]}`}>
          [{data.confidence.toUpperCase()}]
        </span>
        <span className="text-xs text-[#6b6560]">
          {data.query.toUpperCase()}
        </span>
      </div>

      {/* Stats ticker row */}
      <div className="grid grid-cols-2 gap-px bg-[#2a2520] lg:grid-cols-4">
        {[
          {
            label: "FAIR VALUE",
            value: `$${data.fair_value.toFixed(2)}`,
            color: "text-[#39ff14]",
          },
          {
            label: "AVG SOLD",
            value: `$${data.mean_price.toFixed(2)}`,
            color: "text-[#e8e6e3]",
          },
          {
            label: "RANGE",
            value: `$${data.min_price.toFixed(0)}-$${data.max_price.toFixed(0)}`,
            color: "text-[#e8e6e3]",
          },
          {
            label: "DEALS",
            value: `${data.deals.length}/${data.total_active}`,
            color: "text-[#33cc33]",
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-black px-3 py-2.5">
            <div className="text-[10px] font-medium text-[#6b6560]">
              {stat.label}
            </div>
            <div className={`text-lg font-bold ${stat.color}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Best deal ticker */}
      {data.deals.length > 0 && (
        <div className="mt-px flex items-center gap-3 bg-[#0d0b09] px-3 py-2">
          <span className="text-[10px] font-bold text-[#33cc33]">
            BEST DEAL
          </span>
          <span className="flex-1 truncate text-xs text-[#e8e6e3]">
            {data.deals[0].title}
          </span>
          <span className="text-sm font-bold text-[#33cc33]">
            ${data.deals[0].price.toFixed(2)}
          </span>
          <span className="text-xs text-[#6b6560] line-through">
            ${data.fair_value.toFixed(2)}
          </span>
          <span className="bg-[#33cc33] px-1.5 py-0.5 text-[10px] font-bold text-black">
            -{data.deals[0].discount_pct}%
          </span>
        </div>
      )}

      {/* Sample size footer */}
      <div className="mt-px bg-[#0d0b09] px-3 py-1 text-[10px] text-[#6b6560]">
        {data.sample_size} SOLD ITEMS ANALYZED &middot; STD DEV ${data.std_dev.toFixed(2)}
      </div>
    </div>
  );
}
