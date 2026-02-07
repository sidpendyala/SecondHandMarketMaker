"use client";

import {
  DollarSign,
  Loader2,
} from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import SmartFieldsForm from "@/components/SmartFieldsForm";
import type {
  SellAdvisorResponse,
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
  imagePreview?: string | null;
  conditionResult?: ConditionResult | null;
  onImagePreviewChange?: (preview: string | null) => void;
  /** Keys/values from loading-screen refinement; these are not asked again in product details */
  refinementSelections?: Record<string, string>;
}

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
  imagePreview,
  conditionResult,
  onImagePreviewChange,
  refinementSelections,
}: SellAdvisorPanelProps) {
  const confColor = {
    high: "text-[#33cc33]",
    medium: "text-[#32cd32]",
    low: "text-[#ff3333]",
  };

  const recommendedTier = data.recommended_tier || "Competitive";

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Header */}
      <div className="mb-2 flex items-center gap-3 border-b border-[#2a2520] pb-2">
        <span className="text-xs font-bold text-[#39ff14]">SELL ADVISOR</span>
        <span className={`text-[10px] font-bold ${confColor[data.confidence]}`}>
          [{data.confidence.toUpperCase()}]
        </span>
        <span className="text-xs text-[#6b6560]">
          {data.query.toUpperCase()} &middot; {data.sample_size} SALES
        </span>
      </div>

      {/* Market summary ticker */}
      <div className="mb-3 grid grid-cols-3 gap-px bg-[#2a2520]">
        {[
          { label: "FAIR VALUE", value: `$${data.fair_value.toFixed(2)}`, color: "text-[#39ff14]" },
          { label: "AVG SOLD", value: `$${data.mean_price.toFixed(2)}`, color: "text-[#e8e6e3]" },
          { label: "RANGE", value: `$${data.min_price.toFixed(0)}-$${data.max_price.toFixed(0)}`, color: "text-[#e8e6e3]" },
        ].map((s) => (
          <div key={s.label} className="bg-black px-3 py-2">
            <div className="text-[10px] text-[#6b6560]">{s.label}</div>
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Upload + Fields */}
      <div className="mb-3 grid grid-cols-1 gap-px bg-[#2a2520] lg:grid-cols-2">
        <div className="bg-black p-0">
          <ImageUpload
            onConditionResult={onConditionResult}
            uploadImage={uploadImage}
            searchQuery={data.query}
            onProductSuggestionAccepted={onProductSuggestionAccepted}
            initialPreview={imagePreview}
            initialResult={conditionResult}
            onPreviewChange={onImagePreviewChange}
          />
        </div>
        <div className="bg-black p-0">
          <SmartFieldsForm
            fields={productFields}
            isLoading={fieldsLoading}
            onChange={(formValues) =>
              onFieldsChange({
                ...(refinementSelections || {}),
                ...formValues,
              })
            }
            prefilled={detectedAttributes}
            refinementSelections={refinementSelections}
          />
        </div>
      </div>

      {/* Recalculating */}
      {priceRefreshing && (
        <div className="mb-3 flex items-center gap-2 border border-[#2a2520] bg-[#0d0b09] px-3 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-[#39ff14]" />
          <span className="text-xs text-[#6b6560]">RECALCULATING...</span>
        </div>
      )}

      {/* Waiting for input */}
      {!hasUserInput && !priceRefreshing && (
        <div className="border border-dashed border-[#2a2520] py-8 text-center">
          <DollarSign className="mx-auto mb-2 h-6 w-6 text-[#2a2520]" />
          <p className="text-xs text-[#6b6560]">
            UPLOAD PHOTO OR ENTER DETAILS FOR PRICING TIERS
          </p>
        </div>
      )}

      {/* Pricing Tiers */}
      {hasUserInput && (
        <>
          <div className="mb-2 border-b border-[#2a2520] pb-1">
            <span className="text-[10px] font-bold text-[#39ff14]">
              PRICING TIERS
            </span>
          </div>
          <div
            className={`grid grid-cols-1 gap-px bg-[#2a2520] sm:grid-cols-2 lg:grid-cols-4 transition-opacity duration-200 ${
              priceRefreshing ? "opacity-40" : "opacity-100"
            }`}
          >
            {data.tiers.map((tier) => {
              const isRec = tier.name === recommendedTier;
              return (
                <div
                  key={tier.name}
                  className={`bg-black p-3 ${isRec ? "border-l-2 border-l-[#39ff14]" : ""}`}
                >
                  {/* Tier header */}
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#6b6560]">
                      {tier.name.toUpperCase()}
                    </span>
                    {isRec && (
                      <span className="bg-[#39ff14] px-1.5 py-px text-[8px] font-bold text-black">
                        REC
                      </span>
                    )}
                  </div>

                  {/* List price */}
                  <div className={`text-xl font-bold ${isRec ? "text-[#39ff14]" : "text-[#e8e6e3]"}`}>
                    ${tier.list_price.toFixed(2)}
                  </div>

                  {/* Fees */}
                  <div className="mt-2 space-y-0.5 border-t border-[#2a2520] pt-2 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">EBAY FEE</span>
                      <span className="text-[#ff3333]">
                        -${tier.ebay_fee.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6b6560]">SHIPPING</span>
                      <span className="text-[#ff3333]">
                        -${tier.shipping.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#2a2520] pt-1 text-xs">
                      <span className="font-bold text-[#6b6560]">NET</span>
                      <span className="font-bold text-[#33cc33]">
                        ${tier.net_payout.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
