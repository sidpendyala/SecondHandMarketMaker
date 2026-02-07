"use client";

import { useState } from "react";
import {
  ExternalLink,
  Star,
  AlertTriangle,
} from "lucide-react";
import type { DealItem } from "@/lib/types";

interface DealCardProps {
  deal: DealItem;
  className?: string;
}

export default function DealCard({ deal, className }: DealCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const savings = deal.fair_value - deal.price;
  const flipPositive = deal.flip_profit > 0;
  const displayDiscount =
    deal.condition_adjusted_discount ?? deal.discount_pct;

  const conditionColor = (() => {
    if (!deal.condition_rating) return "text-[#6b6560]";
    if (deal.condition_rating >= 8) return "text-[#33cc33]";
    if (deal.condition_rating >= 6) return "text-[#32cd32]";
    return "text-[#ff3333]";
  })();

  return (
    <div className={`holographic-card transition-section ${className ?? ""}`}>
      <div className="holographic-card-inner group transition-colors duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]">
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-black">
        {!imageError ? (
          <img
            src={deal.image}
            alt={deal.title}
            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[#2a2520]">
            <span className="text-2xl">?</span>
          </div>
        )}

        {/* Top badges */}
        {deal.condition_flag === "top_pick" && (
          <div className="absolute top-0 left-0 z-10 flex items-center gap-1 bg-[#39ff14] px-2 py-0.5 text-[9px] font-bold text-black">
            <Star className="h-2.5 w-2.5 fill-black" />
            TOP PICK
          </div>
        )}

        <div className="absolute top-0 right-0 z-10 bg-[#33cc33] px-2 py-0.5 text-[10px] font-bold text-black">
          -{displayDiscount}%
        </div>

        {deal.condition_flag === "fair_warning" && (
          <div className="absolute right-0 bottom-0 z-10 flex items-center gap-1 bg-[#ff3333] px-2 py-0.5 text-[9px] font-bold text-black">
            <AlertTriangle className="h-2.5 w-2.5" />
            FAIR
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-end bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex w-full">
            {deal.condition_notes && (
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="flex-1 border-r border-[#2a2520] py-2 text-[10px] font-bold text-[#32cd32] hover:bg-[#1a1714]"
              >
                NOTES
              </button>
            )}
            <a
              href={deal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1 py-2 text-[10px] font-bold text-[#39ff14] hover:bg-[#1a1714]"
            >
              <ExternalLink className="h-3 w-3" />
              VIEW
            </a>
          </div>
        </div>
      </div>

      {/* Condition notes */}
      {showNotes && deal.condition_notes && (
        <div className="border-t border-[#2a2520] bg-black px-3 py-1.5 text-[10px] text-[#6b6560]">
          {deal.condition_notes}
        </div>
      )}

      {/* Data section */}
      <div className="border-t border-[#2a2520] px-3 py-2">
        {/* Title */}
        <p className="mb-2 line-clamp-2 text-[11px] leading-tight text-[#e8e6e3]">
          {deal.title}
        </p>

        {/* Price row */}
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold text-[#33cc33]">
            ${deal.price.toFixed(2)}
          </span>
          <span className="text-xs text-[#6b6560] line-through">
            ${deal.fair_value.toFixed(2)}
          </span>
          <span className="text-xs font-bold text-[#33cc33]">
            -${savings.toFixed(2)}
          </span>
        </div>

        {/* Condition row */}
        {deal.condition_rating && (
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-[#6b6560]">CONDITION</span>
            <span className={`font-bold ${conditionColor}`}>
              {deal.condition_label?.toUpperCase()} {deal.condition_rating}/10
            </span>
          </div>
        )}

        {/* Flip row */}
        <div className="mt-1.5 flex items-center justify-between border-t border-[#2a2520] pt-1.5">
          <span className="text-[10px] text-[#6b6560]">FLIP P/L</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold ${flipPositive ? "text-[#33cc33]" : "text-[#ff3333]"}`}
            >
              {flipPositive ? "+" : ""}${deal.flip_profit.toFixed(2)}
            </span>
            <span
              className={`text-[10px] font-bold ${flipPositive ? "text-[#33cc33]" : "text-[#ff3333]"}`}
            >
              ({flipPositive ? "+" : ""}
              {deal.flip_roi}%)
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
