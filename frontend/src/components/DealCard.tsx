"use client";

import { useState } from "react";
import {
  ExternalLink,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  Star,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DealItem } from "@/lib/types";

interface DealCardProps {
  deal: DealItem;
}

export default function DealCard({ deal }: DealCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const savings = deal.fair_value - deal.price;
  const flipPositive = deal.flip_profit > 0;
  const displayDiscount =
    deal.condition_adjusted_discount ?? deal.discount_pct;

  // Condition badge color
  const conditionBadgeStyle = (() => {
    if (!deal.condition_rating) return null;
    if (deal.condition_rating >= 8)
      return "bg-emerald-500 text-white";
    if (deal.condition_rating >= 6)
      return "bg-blue-500 text-white";
    return "bg-amber-500 text-white";
  })();

  return (
    <Card className="group relative overflow-hidden border-slate-200 bg-white transition-all hover:shadow-xl hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900">
      {/* TOP PICK ribbon */}
      {deal.condition_flag === "top_pick" && (
        <div className="absolute top-0 left-0 z-20 flex items-center gap-1 rounded-br-lg bg-gradient-to-r from-amber-500 to-yellow-400 px-2.5 py-1 text-[10px] font-bold text-white shadow-md">
          <Star className="h-3 w-3 fill-white" />
          TOP PICK
        </div>
      )}

      {/* Image Section */}
      <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
        {!imageError ? (
          <img
            src={deal.image}
            alt={deal.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Sparkles className="h-12 w-12" />
          </div>
        )}

        {/* Discount Badge (left) */}
        <div className="absolute top-3 left-3">
          <Badge className="border-0 bg-emerald-500 px-2.5 py-1 text-sm font-bold text-white shadow-lg">
            <TrendingDown className="mr-1 h-3.5 w-3.5" />
            {displayDiscount}% OFF
          </Badge>
        </div>

        {/* Condition Badge (right) */}
        {deal.condition_rating && conditionBadgeStyle && (
          <div className="absolute top-3 right-3">
            <Badge
              className={`border-0 px-2 py-1 text-xs font-bold shadow-lg ${conditionBadgeStyle}`}
            >
              {deal.condition_label} {deal.condition_rating}/10
            </Badge>
          </div>
        )}

        {/* FAIR CONDITION warning */}
        {deal.condition_flag === "fair_warning" && (
          <div className="absolute right-3 bottom-3 z-10">
            <Badge className="border-0 bg-amber-600/90 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm">
              <AlertTriangle className="mr-1 h-3 w-3" />
              FAIR CONDITION
            </Badge>
          </div>
        )}

        {/* Quick actions overlay - only View button now */}
        <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex w-full gap-2 p-3">
            {deal.condition_notes && (
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 bg-white/90 text-slate-900 backdrop-blur-sm hover:bg-white"
                onClick={() => setShowNotes(!showNotes)}
              >
                <Info className="mr-1 h-3.5 w-3.5" />
                Condition
              </Button>
            )}
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
              asChild
            >
              <a href={deal.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                View
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Condition Notes Tooltip */}
      {showNotes && deal.condition_notes && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
          <span className="font-medium">AI Condition Notes:</span>{" "}
          {deal.condition_notes}
        </div>
      )}

      {/* Content */}
      <CardContent className="p-4">
        <h3 className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-200">
          {deal.title}
        </h3>

        {/* Pricing */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ${deal.price.toFixed(2)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Market:{" "}
              <span className="line-through">
                ${deal.fair_value.toFixed(2)}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Save ${savings.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Flip Profit */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight
              className={`h-4 w-4 ${flipPositive ? "text-emerald-500" : "text-red-400"}`}
            />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Flip Profit
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-bold ${flipPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
            >
              {flipPositive ? "+" : ""}${deal.flip_profit.toFixed(2)}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                flipPositive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400"
              }`}
            >
              {deal.flip_roi > 0 ? "+" : ""}
              {deal.flip_roi}% ROI
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
