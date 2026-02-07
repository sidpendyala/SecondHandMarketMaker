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
}

export default function ProgressLoader({
  isLoading,
  mode,
  onComplete,
}: ProgressLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [completed, setCompleted] = useState(false);

  const rafRef = useRef<number | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const wasLoadingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const phases = mode === "buy" ? BUY_PHASES : SELL_PHASES;

  const getSimulatedProgress = useCallback(
    (elapsed: number): number => {
      const maxProgress = 92;
      const speed = mode === "buy" ? 0.06 : 0.08;

      if (elapsed < 3000) {
        return Math.min(25, (elapsed / 3000) * 25);
      }

      const t = (elapsed - 3000) / 1000;
      const base = 25;
      const remaining = maxProgress - base;
      const eased = remaining * (1 - Math.exp(-speed * t));
      return Math.min(maxProgress, base + eased);
    },
    [mode]
  );

  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true;

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
  }, [isLoading]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!visible) return null;

  const currentPhase =
    [...phases].reverse().find((p) => progress >= p.threshold) || phases[0];

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="border border-[#2a2520] bg-[#0d0b09] p-5">
        {/* Status */}
        <div className="mb-4 text-center">
          <div
            className={`mb-2 text-sm font-bold ${
              completed ? "text-[#33cc33]" : "text-[#39ff14]"
            }`}
          >
            {completed
              ? "ANALYSIS COMPLETE"
              : mode === "buy"
                ? "SCANNING MARKET..."
                : "ANALYZING PRICES..."}
          </div>
          <div className="text-[10px] text-[#6b6560]">
            {completed ? "LOADING RESULTS" : currentPhase.label}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="h-1 w-full bg-[#2a2520]">
            <div
              className={`h-full transition-all duration-150 ${
                completed ? "bg-[#33cc33]" : "bg-[#39ff14]"
              }`}
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-[#6b6560]">
            <span>{Math.round(progress)}%</span>
            {!completed && <span>PLEASE WAIT</span>}
          </div>
        </div>

        {/* Phase dots */}
        <div className="flex items-center justify-center gap-1">
          {phases.map((phase, idx) => {
            const isActive = progress >= phase.threshold;
            const isCurrent = !completed && phase === currentPhase;

            return (
              <div
                key={idx}
                className={`h-1 transition-all duration-500 ${
                  isCurrent
                    ? "w-4 bg-[#39ff14]"
                    : isActive
                      ? "w-1 bg-[#39ff14]/40"
                      : "w-1 bg-[#2a2520]"
                } ${completed ? "!bg-[#33cc33]/40" : ""}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
