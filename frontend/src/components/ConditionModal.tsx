"use client";

import { Loader2, Bot, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface ConditionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null;
  analysis: string | null;
  source: "ai" | "mock" | null;
  isLoading: boolean;
  error: string | null;
}

export default function ConditionModal({
  open,
  onOpenChange,
  imageUrl,
  analysis,
  source,
  isLoading,
  error,
}: ConditionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-500" />
            AI Condition Analysis
          </DialogTitle>
          <DialogDescription>
            Powered by{" "}
            {source === "ai" ? "GPT-4o Vision" : "Mock Analysis Engine"}
          </DialogDescription>
        </DialogHeader>

        {/* Product Image Preview */}
        {imageUrl && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <img
              src={imageUrl}
              alt="Product under analysis"
              className="h-48 w-full object-cover"
            />
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm text-slate-500">
              Analyzing product condition...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-400">
                Analysis Failed
              </p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400/80">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Analysis Result */}
        {analysis && !isLoading && (
          <div className="space-y-3">
            {source === "mock" && (
              <Badge
                variant="outline"
                className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                Demo Mode - No API key configured
              </Badge>
            )}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {analysis}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
