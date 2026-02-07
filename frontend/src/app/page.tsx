"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  PackageSearch,
  Frown,
  DollarSign,
  ShieldOff,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  Shuffle,
  ExternalLink,
} from "lucide-react";
import SearchHeader from "@/components/SearchHeader";
import StatsPanel from "@/components/StatsPanel";
import SellAdvisorPanel from "@/components/SellAdvisorPanel";
import DealCard from "@/components/DealCard";
import ProgressLoader from "@/components/ProgressLoader";
import {
  analyzeProduct,
  sellAdvisor,
  uploadImage,
  getProductFields,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  SellAdvisorResponse,
  ProductField,
  ConditionResult,
} from "@/lib/types";

type Mode = "buy" | "sell";

export default function Home() {
  // Mode
  const [mode, setMode] = useState<Mode>("buy");
  const [showFiltered, setShowFiltered] = useState(false);

  // Search state
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [buyData, setBuyData] = useState<AnalyzeResponse | null>(null);
  const [sellData, setSellData] = useState<SellAdvisorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sell-side state
  const [productFields, setProductFields] = useState<ProductField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [sellCondition, setSellCondition] = useState<number | undefined>(
    undefined
  );
  const [sellDetails, setSellDetails] = useState<Record<string, string>>({});
  const [detectedAttrs, setDetectedAttrs] = useState<Record<string, string>>(
    {}
  );
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [searchBarQuery, setSearchBarQuery] = useState<string | undefined>(
    undefined
  );
  const currentSellQuery = useRef<string>("");

  const handleSearch = useCallback(
    async (query: string) => {
      setIsLoading(true);
      setShowResults(false);
      setError(null);
      setBuyData(null);
      setSellData(null);
      setProductFields([]);
      setSellCondition(undefined);
      setSellDetails({});
      setDetectedAttrs({});
      setShowFiltered(false);

      try {
        if (mode === "buy") {
          const result = await analyzeProduct(query);
          setBuyData(result);
        } else {
          currentSellQuery.current = query;

          // Fetch sell advisor + product fields in parallel
          const [advisorResult, fieldsResult] = await Promise.allSettled([
            sellAdvisor(query),
            (async () => {
              setFieldsLoading(true);
              try {
                const r = await getProductFields(query);
                return r;
              } finally {
                setFieldsLoading(false);
              }
            })(),
          ]);

          if (advisorResult.status === "fulfilled") {
            setSellData(advisorResult.value);
          } else {
            throw new Error(
              advisorResult.reason?.message || "Sell analysis failed"
            );
          }

          if (fieldsResult.status === "fulfilled") {
            setProductFields(fieldsResult.value.fields);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setShowResults(true); // show error immediately
      } finally {
        setIsLoading(false);
      }
    },
    [mode]
  );

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode);
    setBuyData(null);
    setSellData(null);
    setError(null);
    setProductFields([]);
    setSellCondition(undefined);
    setSellDetails({});
    setDetectedAttrs({});
  }, []);

  // Sell-side: debounced re-fetch tiers when condition or details change
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSellAdvisor = useCallback(
    (condition?: number, details?: Record<string, string>) => {
      const query = currentSellQuery.current;
      if (!query) return;

      // Show refreshing indicator immediately
      setPriceRefreshing(true);

      // Debounce: wait 800ms after last change before re-fetching
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(async () => {
        try {
          const result = await sellAdvisor(query, condition, details);
          setSellData(result);
        } catch {
          // Don't overwrite the main data; the refinement is optional
        } finally {
          setPriceRefreshing(false);
        }
      }, 800);
    },
    []
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const handleSellCondition = useCallback(
    (result: ConditionResult) => {
      setSellCondition(result.rating);
      refreshSellAdvisor(result.rating, sellDetails);

      // Auto-fill detected attributes from AI
      if (result.detected_attributes && Object.keys(result.detected_attributes).length > 0) {
        setDetectedAttrs(result.detected_attributes);
      }
    },
    [sellDetails, refreshSellAdvisor]
  );

  const handleFieldsChange = useCallback(
    (values: Record<string, string>) => {
      setSellDetails(values);
      refreshSellAdvisor(sellCondition, values);
    },
    [sellCondition, refreshSellAdvisor]
  );

  const handleProductSuggestion = useCallback(
    (detectedProduct: string) => {
      // Re-run the sell search with the AI-detected product name
      if (detectedProduct && detectedProduct !== currentSellQuery.current) {
        setSearchBarQuery(detectedProduct);
        handleSearch(detectedProduct);
      }
    },
    [handleSearch]
  );

  const hasData = (mode === "buy" ? !!buyData : !!sellData) && showResults;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero / Search */}
      <SearchHeader
        onSearch={handleSearch}
        isLoading={isLoading}
        mode={mode}
        onModeChange={handleModeChange}
        externalQuery={searchBarQuery}
      />

      {/* Main Content */}
      <div className="py-10">
        {/* Progress Loader — manages its own visibility lifecycle */}
        <ProgressLoader
          isLoading={isLoading}
          mode={mode}
          onComplete={() => setShowResults(true)}
        />

        {/* Error State */}
        {error && !isLoading && (
          <div className="mx-auto max-w-md px-4 py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
              <Frown className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-white">
              Analysis Failed
            </h3>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        )}

        {/* ==================== BUY MODE RESULTS ==================== */}
        {mode === "buy" && buyData && showResults && (
          <>
            {/* Market Pulse Stats */}
            <StatsPanel data={buyData} />

            {/* Smart Filter Summary */}
            {(buyData.deals_eliminated > 0 ||
              buyData.filtered_items?.length > 0) && (
              <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-8">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  {/* Filter summary header */}
                  <button
                    onClick={() => setShowFiltered(!showFiltered)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                        <ShieldAlert className="h-4 w-4 text-red-500" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {buyData.deals_eliminated} listing
                          {buyData.deals_eliminated !== 1 ? "s" : ""} filtered
                          out
                        </span>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {(() => {
                            const scamCount =
                              buyData.filtered_items?.filter(
                                (f) => f.filter_type === "scam"
                              ).length ?? 0;
                            const mismatchCount =
                              buyData.filtered_items?.filter(
                                (f) => f.filter_type === "mismatch"
                              ).length ?? 0;
                            const conditionCount =
                              buyData.deals_eliminated -
                              (buyData.filtered_items?.length ?? 0);
                            const parts: string[] = [];
                            if (scamCount > 0)
                              parts.push(
                                `${scamCount} scam/fake alert${scamCount !== 1 ? "s" : ""}`
                              );
                            if (mismatchCount > 0)
                              parts.push(
                                `${mismatchCount} product mismatch${mismatchCount !== 1 ? "es" : ""}`
                              );
                            if (conditionCount > 0)
                              parts.push(
                                `${conditionCount} poor condition`
                              );
                            return parts.join(" · ");
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      {showFiltered ? "Hide" : "Show"} details
                      {showFiltered ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {/* Expandable filtered items list */}
                  {showFiltered && buyData.filtered_items?.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      {buyData.filtered_items.map((item, idx) => (
                        <div
                          key={`filtered-${idx}`}
                          className="flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-b-0 dark:border-slate-800/50"
                        >
                          {/* Icon */}
                          <div
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                              item.filter_type === "scam"
                                ? "bg-red-100 dark:bg-red-950/50"
                                : "bg-amber-100 dark:bg-amber-950/50"
                            }`}
                          >
                            {item.filter_type === "scam" ? (
                              <AlertOctagon className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <Shuffle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  item.filter_type === "scam"
                                    ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                }`}
                              >
                                {item.filter_type === "scam"
                                  ? "Scam Alert"
                                  : "Wrong Product"}
                              </span>
                              <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                                {item.title}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              <span className="font-semibold text-slate-600 dark:text-slate-400">
                                ${item.price.toFixed(2)}
                              </span>
                              {" — "}
                              {item.reason}
                            </p>
                          </div>

                          {/* Link */}
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 shrink-0 text-slate-400 transition-colors hover:text-slate-600"
                            title="View listing anyway"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Deals Grid */}
            <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6 lg:px-8">
              <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                Arbitrage Opportunities
                <span className="ml-2 text-base font-normal text-slate-500">
                  ({buyData.deals.length} deals)
                </span>
              </h2>

              {buyData.deals.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {buyData.deals.map((deal, idx) => (
                    <DealCard key={`${deal.url}-${idx}`} deal={deal} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
                  <PackageSearch className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                  <p className="text-slate-500">
                    No deals found below 20% market value. Check back later or
                    try a different search.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================== SELL MODE RESULTS ==================== */}
        {mode === "sell" && sellData && showResults && (
          <SellAdvisorPanel
            data={sellData}
            productFields={productFields}
            fieldsLoading={fieldsLoading}
            onConditionResult={handleSellCondition}
            onFieldsChange={handleFieldsChange}
            uploadImage={uploadImage}
            detectedAttributes={detectedAttrs}
            priceRefreshing={priceRefreshing}
            onProductSuggestionAccepted={handleProductSuggestion}
            hasUserInput={
              sellCondition !== undefined ||
              Object.values(sellDetails).some((v) => !!v)
            }
          />
        )}

        {/* Empty State */}
        {!hasData && !isLoading && !error && (
          <div className="mx-auto max-w-md px-4 py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              {mode === "buy" ? (
                <PackageSearch className="h-8 w-8 text-slate-400" />
              ) : (
                <DollarSign className="h-8 w-8 text-slate-400" />
              )}
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-white">
              {mode === "buy"
                ? "Ready to Find Deals"
                : "Ready to Price Your Item"}
            </h3>
            <p className="text-sm text-slate-500">
              {mode === "buy"
                ? "Search for any product above to discover underpriced listings and arbitrage opportunities."
                : "Search for what you're selling to get market-backed pricing tiers and fee breakdowns."}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
        MarketMaker &mdash; AI-Powered Deal Intelligence. Not financial advice.
      </footer>
    </div>
  );
}
