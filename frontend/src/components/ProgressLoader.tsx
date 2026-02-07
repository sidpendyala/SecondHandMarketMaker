"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  BarChart3,
  ShoppingCart,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Layers,
  ScanSearch,
  TrendingUp,
} from "lucide-react";
import type { ProductField } from "@/lib/types";
import { DropdownSelect } from "@/components/ui/dropdown-select";

type Mode = "buy" | "sell";

interface Phase {
  label: string;
  icon: React.ElementType;
  threshold: number;
}

const BUY_PHASES: Phase[] = [
  { label: "FETCHING SOLD HISTORY...", icon: Search, threshold: 0 },
  { label: "CALCULATING FAIR VALUE...", icon: BarChart3, threshold: 15 },
  { label: "SCANNING ACTIVE LISTINGS...", icon: ShoppingCart, threshold: 30 },
  { label: "IDENTIFYING DEALS...", icon: TrendingUp, threshold: 45 },
  { label: "ANALYZING CONDITIONS...", icon: ScanSearch, threshold: 58 },
  { label: "FILTERING SCAMS...", icon: ShieldCheck, threshold: 72 },
  { label: "FINALIZING...", icon: Sparkles, threshold: 88 },
];

const SELL_PHASES: Phase[] = [
  { label: "FETCHING MARKET DATA...", icon: Search, threshold: 0 },
  { label: "ANALYZING SOLD PRICES...", icon: BarChart3, threshold: 18 },
  { label: "CALCULATING TIERS...", icon: DollarSign, threshold: 38 },
  { label: "GENERATING ATTRIBUTES...", icon: Layers, threshold: 55 },
  { label: "BUILDING RECOMMENDATIONS...", icon: Sparkles, threshold: 78 },
];

interface ProgressLoaderProps {
  isLoading: boolean;
  mode: Mode;
  onComplete?: () => void;
  /** When set, progress pauses and shows inline dropdowns for query refinement */
  refinementFields?: ProductField[];
  /** Called when user submits refinement selections */
  onRefinementSubmit?: (values: Record<string, string>) => void;
}

export default function ProgressLoader({
  isLoading,
  mode,
  onComplete,
  refinementFields,
  onRefinementSubmit,
}: ProgressLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [refinementValues, setRefinementValues] = useState<
    Record<string, string>
  >({});

  const rafRef = useRef<number | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const wasLoadingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Is the loader paused for refinement?
  const isPaused =
    refinementFields && refinementFields.length > 0 && isLoading;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset refinement values when fields change
  useEffect(() => {
    if (refinementFields && refinementFields.length > 0) {
      const defaults: Record<string, string> = {};
      refinementFields.forEach((f) => {
        defaults[f.key] = "";
      });
      setRefinementValues(defaults);
    }
  }, [refinementFields]);

  const phases = mode === "buy" ? BUY_PHASES : SELL_PHASES;

  const getSimulatedProgress = useCallback(
    (elapsed: number): number => {
      // When paused for refinement, cap at 20%
      const maxProgress = isPaused ? 20 : 92;
      const speed = mode === "buy" ? 0.06 : 0.08;

      if (elapsed < 3000) {
        return Math.min(isPaused ? 20 : 25, (elapsed / 3000) * 25);
      }

      const t = (elapsed - 3000) / 1000;
      const base = 25;
      const remaining = maxProgress - base;
      const eased = remaining * (1 - Math.exp(-speed * t));
      return Math.min(maxProgress, base + eased);
    },
    [mode, isPaused]
  );

  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;

      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }

      // Only reset progress if we're starting fresh (not resuming from a pause)
      if (progress === 0 || completed) {
        setVisible(true);
        setCompleted(false);
        setProgress(0);
        startTimeRef.current = performance.now();
      }

      // If paused for refinement, stop the animation
      if (isPaused) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }

      const tick = (now: number) => {
        const elapsed = now - startTimeRef.current;
        setProgress(getSimulatedProgress(elapsed));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else if (wasLoadingRef.current) {
      wasLoadingRef.current = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      setProgress(100);
      setCompleted(true);

      completionTimerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
        setCompleted(false);
        onCompleteRef.current?.();
      }, 700);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isPaused]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!visible) return null;

  const currentPhase =
    [...phases].reverse().find((p) => progress >= p.threshold) || phases[0];

  const handleRefinementChange = (key: string, value: string) => {
    setRefinementValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleContinue = () => {
    // Filter out empty values
    const selected: Record<string, string> = {};
    Object.entries(refinementValues).forEach(([k, v]) => {
      if (v) selected[k] = v;
    });
    onRefinementSubmit?.(selected);
  };

  return (
    <div className="animate-in-section mx-auto max-w-4xl px-4 py-16">
      <div className="border border-[#2a2520] bg-[#0d0b09] px-12 py-10">
        {/* Status */}
        <div className="mb-6 text-center">
          <div
            className={`mb-3 text-xl font-bold tracking-tight ${
              completed
                ? "text-[#33cc33]"
                : isPaused
                  ? "text-[#39ff14]"
                  : "text-[#39ff14]"
            }`}
          >
            {completed
              ? "ANALYSIS COMPLETE"
              : isPaused
                ? "REFINE YOUR SEARCH"
                : mode === "buy"
                  ? "SCANNING MARKET..."
                  : "ANALYZING PRICES..."}
          </div>
          <div className="text-base text-[#6b6560]">
            {completed
              ? "LOADING RESULTS"
              : isPaused
                ? "SELECT PARAMETERS TO NARROW DOWN RESULTS"
                : currentPhase.label}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-2 w-full bg-[#2a2520]">
            <div
              className={`h-full transition-all duration-[280ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${
                completed
                  ? "bg-[#33cc33]"
                  : isPaused
                    ? "bg-[#39ff14]/60"
                    : "bg-[#39ff14]"
              }`}
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-base text-[#6b6560]">
            <span>{Math.round(progress)}%</span>
            {!completed && !isPaused && <span>PLEASE WAIT</span>}
            {isPaused && <span>WAITING FOR INPUT</span>}
          </div>
        </div>

        {/* Refinement fields (shown when paused) */}
        {isPaused && refinementFields && refinementFields.length > 0 && (
          <div className="mt-6 border-t border-[#2a2520] pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {refinementFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-bold text-[#6b6560] uppercase tracking-wide">
                    {field.name}
                  </label>
                  <DropdownSelect
                    value={refinementValues[field.key] || ""}
                    onValueChange={(v) => handleRefinementChange(field.key, v)}
                    options={field.options}
                    emptyOptionLabel="Any"
                    size="md"
                    aria-label={field.name}
                  />
                </div>
              ))}
            </div>

            {/* Continue only */}
            <div className="mt-5">
              <button
                onClick={handleContinue}
                className="w-full border border-[#39ff14] bg-[#39ff14]/10 px-4 py-2.5 text-sm font-bold text-[#39ff14] transition-colors hover:bg-[#39ff14]/20"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* Phase dots (hidden when paused to reduce clutter) */}
        {!isPaused && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {phases.map((phase, idx) => {
              const isActive = progress >= phase.threshold;
              const isCurrent = !completed && phase === currentPhase;

              return (
                <div
                  key={idx}
                  className={`h-2 transition-all duration-500 ${
                    isCurrent
                      ? "w-6 bg-[#39ff14]"
                      : isActive
                        ? "w-2 bg-[#39ff14]/40"
                        : "w-2 bg-[#2a2520]"
                  } ${completed ? "!bg-[#33cc33]/40" : ""}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
