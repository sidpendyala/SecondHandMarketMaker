"use client";

import { useState, useCallback, useRef } from "react";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConditionResult } from "@/lib/types";

interface ImageUploadProps {
  onConditionResult: (result: ConditionResult) => void;
  uploadImage: (file: File) => Promise<ConditionResult>;
  isLoading?: boolean;
}

export default function ImageUpload({
  onConditionResult,
  uploadImage,
  isLoading: externalLoading,
}: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConditionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isProcessing = loading || externalLoading;

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file (JPEG, PNG, etc.)");
        return;
      }

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      // Upload and analyze
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const conditionResult = await uploadImage(file);
        setResult(conditionResult);
        onConditionResult(conditionResult);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to analyze image"
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
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const ratingColor = (rating: number) => {
    if (rating >= 8) return "bg-emerald-500";
    if (rating >= 6) return "bg-blue-500";
    if (rating >= 4) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="p-5">
        <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <Camera className="mr-1.5 inline-block h-4 w-4" />
          Upload Product Photo
        </h4>

        {!preview ? (
          /* Drop zone */
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
              dragOver
                ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/20"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
            }`}
          >
            <Upload className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Drag & drop your photo here
            </p>
            <p className="mt-1 text-xs text-slate-400">
              or click to browse (JPEG, PNG)
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
          /* Preview + result */
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl">
              <img
                src={preview}
                alt="Product preview"
                className="h-48 w-full object-cover"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 p-0 text-white hover:bg-black/70"
                onClick={handleReset}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Loading */}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                <span className="text-sm text-slate-500">
                  Analyzing condition...
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Result */}
            {result && !isProcessing && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                {/* Condition */}
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`border-0 text-white ${ratingColor(result.rating)}`}
                    >
                      {result.rating}/10
                    </Badge>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {result.label}
                    </span>
                  </div>
                </div>
                {result.notes && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {result.notes}
                  </p>
                )}
                {result.source === "mock" && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
                    Demo mode – Add OpenAI billing credits or GEMINI_API_KEY for real AI vision
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
