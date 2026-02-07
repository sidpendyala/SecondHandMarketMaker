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

type Mode = "buy" | "sell";

interface Phase {
  label: string;
  icon: React.ElementType;
  threshold: number; // progress % where this phase starts
}

const BUY_PHASES: Phase[] = [
  { label: "Fetching sold history from eBay...", icon: Search, threshold: 0 },
  { label: "Calculating fair market value...", icon: BarChart3, threshold: 15 },
  { label: "Scanning active listings...", icon: ShoppingCart, threshold: 30 },
  { label: "Identifying underpriced deals...", icon: TrendingUp, threshold: 45 },
  { label: "Analyzing item conditions...", icon: ScanSearch, threshold: 58 },
  { label: "Filtering scams & mismatches...", icon: ShieldCheck, threshold: 72 },
  { label: "Finalizing results...", icon: Sparkles, threshold: 88 },
];

const SELL_PHASES: Phase[] = [
  { label: "Fetching market data from eBay...", icon: Search, threshold: 0 },
  { label: "Analyzing recent sold prices...", icon: BarChart3, threshold: 18 },
  { label: "Calculating pricing tiers...", icon: DollarSign, threshold: 38 },
  { label: "Generating product attributes...", icon: Layers, threshold: 55 },
  { label: "Building recommendations...", icon: Sparkles, threshold: 78 },
];

interface ProgressLoaderProps {
  isLoading: boolean;
  mode: Mode;
  onComplete?: () => void;
}

export default function ProgressLoader({
  isLoading,
  mode,
  onComplete,
}: ProgressLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(false);

  // All timers/state stored in refs so they survive re-renders
  const rafRef = useRef<number | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref fresh without triggering effects
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const phases = mode === "buy" ? BUY_PHASES : SELL_PHASES;

  // Easing curve: fast start, gradual slowdown toward ~92%
  const getSimulatedProgress = useCallback((elapsed: number): number => {
    const maxProgress = 92;
    const speed = mode === "buy" ? 0.06 : 0.08;

    if (elapsed < 3000) {
      // Fast initial burst to ~25%
      return Math.min(25, (elapsed / 3000) * 25);
    }

    const t = (elapsed - 3000) / 1000;
    const base = 25;
    const remaining = maxProgress - base;
    const eased = remaining * (1 - Math.exp(-speed * t));
    return Math.min(maxProgress, base + eased);
  }, [mode]);

  // Main lifecycle — ONLY reacts to isLoading changes
  useEffect(() => {
    if (isLoading) {
      // === STARTING ===
      // Clear any leftover completion timer from a previous run
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }

      setVisible(true);
      setCompleted(false);
      setProgress(0);
      startTimeRef.current = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTimeRef.current;
        setProgress(getSimulatedProgress(elapsed));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // === FINISHED ===
      // Stop the animation loop
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Only do the completion dance if we were actually visible (i.e. we loaded)
      // Use a microtask check: if visible was never set, just fire onComplete
      setProgress((prev) => {
        if (prev > 0) {
          // We were animating — snap to 100% and show completion
          setCompleted(true);

          completionTimerRef.current = setTimeout(() => {
            setVisible(false);
            setProgress(0);
            setCompleted(false);
            onCompleteRef.current?.();
          }, 700);

          return 100;
        }
        // Never started animating — fire onComplete immediately
        onCompleteRef.current?.();
        return 0;
      });
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!visible) return null;

  // Determine current phase
  const currentPhase =
    [...phases].reverse().find((p) => progress >= p.threshold) || phases[0];
  const PhaseIcon = completed ? CheckCircle2 : currentPhase.icon;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Icon + status */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-all duration-500 ${
              completed
                ? "bg-emerald-100 dark:bg-emerald-950/50"
                : "bg-amber-100 dark:bg-amber-950/50"
            }`}
          >
            <PhaseIcon
              className={`h-8 w-8 transition-all duration-500 ${
                completed
                  ? "text-emerald-500"
                  : "animate-pulse text-amber-500"
              }`}
            />
          </div>
          <h3
            className={`text-lg font-semibold transition-colors duration-300 ${
              completed
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-800 dark:text-white"
            }`}
          >
            {completed
              ? "Analysis Complete!"
              : mode === "buy"
                ? "Finding Deals..."
                : "Analyzing Market..."}
          </h3>
          <p className="mt-1 text-sm text-slate-500 transition-all duration-300">
            {completed ? "Preparing your results" : currentPhase.label}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                completed
                  ? "bg-emerald-500 duration-500"
                  : "bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 duration-150"
              }`}
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              {Math.round(progress)}%
            </span>
            {!completed && (
              <span className="text-xs text-slate-400">Please wait...</span>
            )}
          </div>
        </div>

        {/* Phase indicators (dots) */}
        <div className="flex items-center justify-center gap-1.5">
          {phases.map((phase, idx) => {
            const isActive = progress >= phase.threshold;
            const isCurrent = !completed && phase === currentPhase;

            return (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  isCurrent
                    ? "w-6 bg-amber-500"
                    : isActive
                      ? "w-1.5 bg-amber-400/60"
                      : "w-1.5 bg-slate-200 dark:bg-slate-700"
                } ${completed ? "!bg-emerald-400/60" : ""}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
