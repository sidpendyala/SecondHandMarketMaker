"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  X,
  Lightbulb,
} from "lucide-react";
import type { ConditionResult } from "@/lib/types";

interface ImageUploadProps {
  onConditionResult: (result: ConditionResult) => void;
  uploadImage: (file: File) => Promise<ConditionResult>;
  isLoading?: boolean;
  searchQuery?: string;
  onProductSuggestionAccepted?: (detectedProduct: string) => void;
  initialPreview?: string | null;
  initialResult?: ConditionResult | null;
  onPreviewChange?: (preview: string | null) => void;
}

export default function ImageUpload({
  onConditionResult,
  uploadImage,
  isLoading: externalLoading,
  searchQuery,
  onProductSuggestionAccepted,
  initialPreview,
  initialResult,
  onPreviewChange,
}: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialPreview ?? null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConditionResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isProcessing = loading || externalLoading;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("INVALID FILE FORMAT");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        onPreviewChange?.(dataUrl);
      };
      reader.readAsDataURL(file);

      setLoading(true);
      setError(null);
      setResult(null);
      setSuggestionDismissed(false);

      try {
        const conditionResult = await uploadImage(file);
        setResult(conditionResult);
        onConditionResult(conditionResult);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "ANALYSIS FAILED"
        );
      } finally {
        setLoading(false);
      }
    },
    [uploadImage, onConditionResult]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleReset = useCallback(() => {
    setPreview(null);
    setResult(null);
    setError(null);
    setSuggestionDismissed(false);
    onPreviewChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [onPreviewChange]);

  const ratingColor = (rating: number) => {
    if (rating >= 8) return "text-[#33cc33]";
    if (rating >= 6) return "text-[#32cd32]";
    if (rating >= 4) return "text-[#39ff14]";
    return "text-[#ff3333]";
  };

  const searchNorm = (searchQuery ?? "").toLowerCase().trim();
  const detectedNorm = (result?.detected_product ?? "").toLowerCase().trim();
  const searchAlreadyHasSuggested =
    searchNorm.length > 0 &&
    detectedNorm.length > 0 &&
    (searchNorm.includes(detectedNorm) || detectedNorm.includes(searchNorm));

  const showSuggestion =
    result?.detected_product &&
    !suggestionDismissed &&
    !isProcessing &&
    result.source !== "mock" &&
    !searchAlreadyHasSuggested;

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2520] bg-[#0d0b09] p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#39ff14]">
        Photo upload
      </div>

      {!preview ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition-all duration-200 ${
            dragOver
              ? "border-[#39ff14] bg-[#39ff14]/10 ring-2 ring-[#39ff14]/30"
              : "border-[#2a2520] bg-[#0a0908] hover:border-[#3d3832] hover:bg-[#0d0b09]"
          }`}
          style={{
            backgroundImage: dragOver
              ? "none"
              : "linear-gradient(rgba(42,37,32,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(42,37,32,0.4) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        >
          <Upload
            className={`mb-2 h-6 w-6 transition-colors ${
              dragOver ? "text-[#39ff14]" : "text-[#6b6560]"
            }`}
          />
          <p className="text-xs font-medium text-[#e8e6e3]">
            Upload file
          </p>
          <p className="mt-0.5 text-[11px] text-[#6b6560]">
            Drag or drop your image here or click to upload
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg">
            <img
              src={preview}
              alt="Product"
              className="h-40 w-full object-cover"
            />
            <button
              onClick={handleReset}
              className="absolute top-1 right-1 bg-black/80 p-1 text-[#e8e6e3] hover:bg-black"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {isProcessing && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3 w-3 animate-spin text-[#39ff14]" />
              <span className="text-[10px] text-[#6b6560]">ANALYZING...</span>
            </div>
          )}

          {error && (
            <div className="border border-[#ff3333]/30 bg-[#ff3333]/5 px-2 py-1.5 text-[10px] text-[#ff3333]">
              {error}
            </div>
          )}

          {result && !isProcessing && (
            <div className="border border-[#2a2520] bg-black p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#6b6560]">CONDITION</span>
                <span className={`text-sm font-bold ${ratingColor(result.rating)}`}>
                  {result.rating}/10
                </span>
                <span className="text-[11px] text-[#e8e6e3]">
                  {result.label?.toUpperCase()}
                </span>
              </div>
              {result.notes && (
                <p className="mt-1 text-[10px] text-[#6b6560]">
                  {result.notes}
                </p>
              )}

              {showSuggestion && (
                <div className="mt-2 border border-[#32cd32]/20 bg-[#32cd32]/5 p-2">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[#32cd32]" />
                    <div className="flex-1">
                      <p className="text-[10px] text-[#6b6560]">DETECTED:</p>
                      <p className="text-[11px] font-bold text-[#32cd32]">
                        {result.detected_product}
                      </p>
                      {searchQuery && (
                        <p className="mt-0.5 text-[9px] text-[#6b6560]">
                          SEARCHED: &quot;{searchQuery.toUpperCase()}&quot;
                        </p>
                      )}
                      <div className="mt-1.5 flex gap-1">
                        {onProductSuggestionAccepted && (
                          <button
                            onClick={() => {
                              onProductSuggestionAccepted(
                                result.detected_product!
                              );
                              setSuggestionDismissed(true);
                            }}
                            className="bg-[#39ff14] px-2 py-0.5 text-[9px] font-bold text-black hover:bg-[#32cd32]"
                          >
                            USE THIS
                          </button>
                        )}
                        <button
                          onClick={() => setSuggestionDismissed(true)}
                          className="border border-[#2a2520] px-2 py-0.5 text-[9px] text-[#6b6560] hover:text-[#e8e6e3]"
                        >
                          IGNORE
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {result.source === "mock" && (
                <div className="mt-1.5 border border-[#32cd32]/20 bg-[#32cd32]/5 px-2 py-1 text-[9px] text-[#32cd32]">
                  DEMO MODE — ADD API KEYS FOR REAL AI
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
