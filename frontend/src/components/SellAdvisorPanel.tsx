"use client";

import {
  DollarSign,
  Zap,
  Target,
  TrendingUp,
  Crown,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ImageUpload from "@/components/ImageUpload";
import SmartFieldsForm from "@/components/SmartFieldsForm";
import type {
  SellAdvisorResponse,
  PriceTier,
  ProductField,
  ConditionResult,
} from "@/lib/types";

interface SellAdvisorPanelProps {
  data: SellAdvisorResponse;
  productFields: ProductField[];
  fieldsLoading: boolean;
  onConditionResult: (result: ConditionResult) => void;
  onFieldsChange: (values: Record<string, string>) => void;
  uploadImage: (file: File) => Promise<ConditionResult>;
  detectedAttributes?: Record<string, string>;
  priceRefreshing?: boolean;
  onProductSuggestionAccepted?: (detectedProduct: string) => void;
  hasUserInput?: boolean;
}

const tierMeta: Record<
  string,
  {
    icon: typeof Zap;
    accent: string;
    iconBg: string;
    description: string;
  }
> = {
  "Quick Sale": {
    icon: Zap,
    accent: "text-blue-400",
    iconBg: "bg-blue-500/10",
    description: "Sells fast within 1-2 days",
  },
  Competitive: {
    icon: Target,
    accent: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    description: "Best balance of speed and profit",
  },
  "Market Value": {
    icon: BarChart3,
    accent: "text-purple-400",
    iconBg: "bg-purple-500/10",
    description: "Priced at the median sold price",
  },
  Premium: {
    icon: Crown,
    accent: "text-amber-400",
    iconBg: "bg-amber-500/10",
    description: "Maximum profit, may take longer",
  },
};

export default function SellAdvisorPanel({
  data,
  productFields,
  fieldsLoading,
  onConditionResult,
  onFieldsChange,
  uploadImage,
  detectedAttributes,
  priceRefreshing,
  onProductSuggestionAccepted,
  hasUserInput,
}: SellAdvisorPanelProps) {
  const confidenceColor = {
    high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  // Determine which tier to recommend (from backend or default)
  const recommendedTier = data.recommended_tier || "Competitive";

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          Sell Advisor
        </h2>
        <Badge
          variant="outline"
          className={`text-xs ${confidenceColor[data.confidence]}`}
        >
          {data.confidence.toUpperCase()} CONFIDENCE
        </Badge>
        <span className="text-sm text-slate-500">
          &quot;{data.query}&quot; &middot; {data.sample_size} recent sales
          analyzed
        </span>
      </div>

      {/* Market Summary Bar */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/30">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Fair Market Value
            </p>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-300">
              ${data.fair_value.toFixed(2)}
            </p>
          </div>
          <div className="hidden h-10 w-px bg-amber-200 dark:bg-amber-800 sm:block" />
          <div>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Average Sold
            </p>
            <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
              ${data.mean_price.toFixed(2)}
            </p>
          </div>
          <div className="hidden h-10 w-px bg-amber-200 dark:bg-amber-800 sm:block" />
          <div>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Price Range
            </p>
            <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
              ${data.min_price.toFixed(0)} &ndash; ${data.max_price.toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      {/* Image Upload + Smart Fields side by side */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImageUpload
          onConditionResult={onConditionResult}
          uploadImage={uploadImage}
          searchQuery={data.query}
          onProductSuggestionAccepted={onProductSuggestionAccepted}
        />
        <SmartFieldsForm
          fields={productFields}
          isLoading={fieldsLoading}
          onChange={onFieldsChange}
          prefilled={detectedAttributes}
        />
      </div>

      {/* Price recalculating indicator */}
      {priceRefreshing && (
        <div className="mb-6 flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Recalculating prices based on your inputs...
          </span>
        </div>
      )}

      {/* Prompt to provide input before showing tiers */}
      {!hasUserInput && !priceRefreshing && (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center dark:border-slate-700">
          <DollarSign className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Upload a photo or fill in product details above to get personalized
            pricing tiers
          </p>
        </div>
      )}

      {/* Pricing Tiers — only show once user has provided input */}
      {hasUserInput && (
        <>
          <h3 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
            Recommended Pricing Tiers
          </h3>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-300 ${priceRefreshing ? "opacity-50" : "opacity-100"}`}>
        {data.tiers.map((tier) => {
          const config = tierMeta[tier.name] || {
            icon: DollarSign,
            accent: "text-slate-400",
            iconBg: "bg-slate-500/10",
            description: "",
          };
          const Icon = config.icon;
          const isRecommended = tier.name === recommendedTier;

          return (
            <Card
              key={tier.name}
              className={`relative overflow-hidden transition-all hover:shadow-lg ${
                isRecommended
                  ? "border-emerald-300 ring-2 ring-emerald-500/20 dark:border-emerald-700"
                  : "border-slate-200 dark:border-slate-800"
              } bg-white dark:bg-slate-900`}
            >
              {isRecommended && (
                <div className="absolute top-0 right-0 rounded-bl-lg bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white">
                  RECOMMENDED
                </div>
              )}
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className={`rounded-lg p-2 ${config.iconBg}`}>
                    <Icon className={`h-4 w-4 ${config.accent}`} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {tier.name}
                  </span>
                </div>

                <p className={`mb-1 text-3xl font-bold ${config.accent}`}>
                  ${tier.list_price.toFixed(2)}
                </p>
                <p className="mb-4 text-xs text-slate-500">
                  {config.description}
                </p>

                {/* Fee breakdown */}
                <div className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">eBay Fee (13.25%)</span>
                    <span className="text-red-500">
                      -${tier.ebay_fee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Shipping Est.</span>
                    <span className="text-red-500">
                      -${tier.shipping.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      You Keep
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      ${tier.net_payout.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
        </>
      )}
    </div>
  );
}
