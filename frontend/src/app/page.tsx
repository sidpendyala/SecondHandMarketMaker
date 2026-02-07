"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import {
  Frown,
  DollarSign,
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
  refineQuery,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  SellAdvisorResponse,
  ProductField,
  ConditionResult,
} from "@/lib/types";

type Mode = "buy" | "sell";

export default function Home() {
  const [mode, setMode] = useState<Mode>("buy");
  const [showFiltered, setShowFiltered] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [buyData, setBuyData] = useState<AnalyzeResponse | null>(null);
  const [sellData, setSellData] = useState<SellAdvisorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  // Lifted image state so it survives panel unmount/remount during loading
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [conditionResult, setConditionResult] =
    useState<ConditionResult | null>(null);
  // Query refinement state
  const [refinementFields, setRefinementFields] = useState<ProductField[]>([]);
  /** Selections from loading-screen refinement (e.g. Year, Chip, Storage); not asked again in sell product details */
  const [refinementSelections, setRefinementSelections] = useState<
    Record<string, string>
  >({});
  const pendingQueryRef = useRef<string>("");
  const keepImageRef = useRef(false);
  const currentSellQuery = useRef<string>("");

  /**
   * Execute the actual data fetch (buy or sell) with the given query.
   * Called either directly (no refinement needed) or after user completes refinement.
   * refinementValues: when provided (sell mode), merged into sell details and stored so product-detail form won't ask again.
   */
  const executeSearch = useCallback(
    async (
      query: string,
      keepImage: boolean,
      refinementValues?: Record<string, string>
    ) => {
      try {
        if (mode === "buy") {
          const result = await analyzeProduct(query);
          setBuyData(result);
        } else {
          currentSellQuery.current = query;
          const detailsForAdvisor = {
            ...(refinementValues || {}),
            ...(keepImage ? sellDetails : {}),
          };

          const [advisorResult, fieldsResult] = await Promise.allSettled([
            sellAdvisor(
              query,
              keepImage ? sellCondition : undefined,
              Object.keys(detailsForAdvisor).length > 0
                ? detailsForAdvisor
                : undefined
            ),
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

          if (refinementValues && Object.keys(refinementValues).length > 0) {
            setRefinementSelections(refinementValues);
            setSellDetails((prev) => ({ ...refinementValues, ...prev }));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setShowResults(true);
      } finally {
        setIsLoading(false);
      }
    },
    [mode, sellCondition, sellDetails]
  );

  const handleSearch = useCallback(
    async (query: string, keepImage = false) => {
      setIsLoading(true);
      setShowResults(false);
      setError(null);
      setBuyData(null);
      setSellData(null);
      setProductFields([]);
      setShowFiltered(false);
      setRefinementFields([]);
      setRefinementSelections({});

      if (!keepImage) {
        setSellCondition(undefined);
        setSellDetails({});
        setDetectedAttrs({});
        setImagePreview(null);
        setConditionResult(null);
      }

      // Store for later use by refinement callbacks
      pendingQueryRef.current = query;
      keepImageRef.current = keepImage;

      try {
        // 1. Check if query needs refinement
        const refinement = await refineQuery(query);

        if (refinement.needs_refinement && refinement.fields.length > 0) {
          // Pause: show refinement fields in ProgressLoader
          setRefinementFields(refinement.fields);
          // isLoading stays true -> loader stays visible but paused
          return;
        }

        // 2. No refinement needed -> execute immediately
        await executeSearch(query, keepImage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setShowResults(true);
        setIsLoading(false);
      }
    },
    [executeSearch]
  );

  /**
   * Called when user submits refinement selections from the ProgressLoader.
   */
  const handleRefinementSubmit = useCallback(
    (values: Record<string, string>) => {
      const baseQuery = pendingQueryRef.current;
      const keepImage = keepImageRef.current;

      // Build refined query by appending selected values
      const parts = Object.values(values).filter((v) => v);
      const refinedQuery = parts.length > 0
        ? `${baseQuery} ${parts.join(" ")}`
        : baseQuery;

      // Update search bar to show refined query
      setSearchBarQuery(refinedQuery);

      // Clear refinement UI and resume loading
      setRefinementFields([]);

      // Execute the actual search with the refined query; pass values so sell side won't ask again
      executeSearch(refinedQuery, keepImage, values);
    },
    [executeSearch]
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
    setRefinementSelections({});
    setImagePreview(null);
    setConditionResult(null);
  }, []);

  /** Home: clear everything but keep current mode (buy/sell) */
  const handleHomeClick = useCallback(() => {
    setBuyData(null);
    setSellData(null);
    setError(null);
    setSearchBarQuery(undefined);
    setRefinementFields([]);
    setRefinementSelections({});
    setProductFields([]);
    setSellCondition(undefined);
    setSellDetails({});
    setDetectedAttrs({});
    setImagePreview(null);
    setConditionResult(null);
    setShowResults(false);
    setShowFiltered(false);
    setIsLoading(false);
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshGeneration = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshSellAdvisor = useCallback(
    (condition?: number, details?: Record<string, string>) => {
      const query = currentSellQuery.current;
      if (!query) return;

      // Show placeholders immediately (before any condition/details update) so we never paint wrong prices
      flushSync(() => setPriceRefreshing(true));

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      abortControllerRef.current?.abort();
      const generation = ++refreshGeneration.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      refreshTimer.current = setTimeout(async () => {
        try {
          const result = await sellAdvisor(query, condition, details, controller.signal);
          if (generation !== refreshGeneration.current) return;
          setSellData(result);
        } catch (e) {
          if (generation !== refreshGeneration.current) return;
          if ((e as Error)?.name === "AbortError") return;
          // silent for other errors
        } finally {
          if (generation === refreshGeneration.current) {
            setPriceRefreshing(false);
          }
        }
      }, 800);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSellCondition = useCallback(
    (result: ConditionResult) => {
      // Refresh first so placeholders show before we render new condition (avoids wrong-then-right flash)
      refreshSellAdvisor(result.rating, sellDetails);
      setSellCondition(result.rating);
      setConditionResult(result);

      if (
        result.detected_attributes &&
        Object.keys(result.detected_attributes).length > 0
      ) {
        setDetectedAttrs(result.detected_attributes);
      }
    },
    [sellDetails, refreshSellAdvisor]
  );

  const handleFieldsChange = useCallback(
    (values: Record<string, string>) => {
      // Refresh first so placeholders show before we render new details (avoids wrong-then-right flash)
      refreshSellAdvisor(sellCondition, values);
      setSellDetails(values);
    },
    [sellCondition, refreshSellAdvisor]
  );

  const handleProductSuggestion = useCallback(
    (detectedProduct: string) => {
      if (!detectedProduct || detectedProduct === currentSellQuery.current)
        return;

      // Update search bar, keep image/condition, run full loading screen
      setSearchBarQuery(detectedProduct);
      handleSearch(detectedProduct, true);
    },
    [handleSearch]
  );

  const hasData = (mode === "buy" ? !!buyData : !!sellData) && showResults;

  return (
    <div className="relative min-h-screen bg-black">
      {/* Shape Landing Hero background */}
      <div className="shape-hero-bg" aria-hidden>
        <div className="shape-blob shape-blob-1" />
        <div className="shape-blob shape-blob-2" />
        <div className="shape-blob shape-blob-3" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
      {/* Terminal Header */}
      <SearchHeader
        onSearch={handleSearch}
        isLoading={isLoading}
        mode={mode}
        onModeChange={handleModeChange}
        externalQuery={searchBarQuery}
        onHomeClick={handleHomeClick}
      />

      {/* Main: grows to fill space so footer stays at bottom */}
      <div className="flex flex-1 flex-col py-4">
        <ProgressLoader
          isLoading={isLoading}
          mode={mode}
          onComplete={() => setShowResults(true)}
          refinementFields={refinementFields}
          onRefinementSubmit={handleRefinementSubmit}
        />

        {/* Error: centered when no other content */}
        {error && !isLoading && (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="animate-in-section mx-auto max-w-md text-center">
              <Frown className="mx-auto mb-2 h-6 w-6 text-[#ff3333]" />
              <div className="text-xs font-bold text-[#ff3333]">
                ANALYSIS FAILED
              </div>
              <p className="mt-1 text-[11px] text-[#6b6560]">{error}</p>
            </div>
          </div>
        )}

        {/* ==================== BUY MODE ==================== */}
        {mode === "buy" && buyData && showResults && !isLoading && (
          <div className="animate-in-section">
            <StatsPanel data={buyData} />

            {/* Filter Summary */}
            {(buyData.deals_eliminated > 0 ||
              buyData.filtered_items?.length > 0) && (
              <div className="mx-auto mt-1 max-w-6xl px-4">
                <div className="border border-[#2a2520] bg-[#0d0b09]">
                  <button
                    onClick={() => setShowFiltered(!showFiltered)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#1a1714]"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-3.5 w-3.5 text-[#ff3333]" />
                      <span className="text-[11px] font-bold text-[#ff3333]">
                        {buyData.deals_eliminated} FILTERED
                      </span>
                      <span className="text-[10px] text-[#6b6560]">
                        {(() => {
                          const scam =
                            buyData.filtered_items?.filter(
                              (f) => f.filter_type === "scam"
                            ).length ?? 0;
                          const mismatch =
                            buyData.filtered_items?.filter(
                              (f) => f.filter_type === "mismatch"
                            ).length ?? 0;
                          const cond =
                            buyData.deals_eliminated -
                            (buyData.filtered_items?.length ?? 0);
                          const p: string[] = [];
                          if (scam > 0) p.push(`${scam} SCAM`);
                          if (mismatch > 0) p.push(`${mismatch} MISMATCH`);
                          if (cond > 0) p.push(`${cond} CONDITION`);
                          return p.join(" / ");
                        })()}
                      </span>
                    </div>
                    {showFiltered ? (
                      <ChevronUp className="h-3.5 w-3.5 text-[#6b6560]" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-[#6b6560]" />
                    )}
                  </button>

                  {showFiltered && buyData.filtered_items?.length > 0 && (
                    <div className="animate-in-section border-t border-[#2a2520]">
                      {buyData.filtered_items.map((item, idx) => (
                        <div
                          key={`filtered-${idx}`}
                          className="flex items-start gap-2 border-b border-[#2a2520]/50 px-3 py-2 last:border-b-0"
                        >
                          {item.filter_type === "scam" ? (
                            <AlertOctagon className="mt-0.5 h-3 w-3 shrink-0 text-[#ff3333]" />
                          ) : (
                            <Shuffle className="mt-0.5 h-3 w-3 shrink-0 text-[#32cd32]" />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[9px] font-bold ${
                                  item.filter_type === "scam"
                                    ? "text-[#ff3333]"
                                    : "text-[#32cd32]"
                                }`}
                              >
                                {item.filter_type === "scam"
                                  ? "SCAM"
                                  : "MISMATCH"}
                              </span>
                              <span className="truncate text-[11px] text-[#e8e6e3]">
                                {item.title}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-[#6b6560]">
                              <span className="font-bold text-[#e8e6e3]">
                                ${item.price.toFixed(2)}
                              </span>
                              {" — "}
                              {item.reason}
                            </p>
                          </div>

                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 shrink-0 text-[#2a2520] hover:text-[#6b6560]"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Deals Grid */}
            <div className="mx-auto mt-4 max-w-6xl px-4">
              <div className="mb-3 flex items-center gap-2 border-b border-[#2a2520] pb-2">
                <span className="text-xs font-bold text-[#39ff14]">
                  UNDERPRICED OPPORTUNITIES
                </span>
                <span className="text-[10px] text-[#6b6560]">
                  {buyData.deals.length} DEALS
                </span>
              </div>

              {buyData.deals.length > 0 ? (
                <div className="stagger-children grid grid-cols-1 bg-black sm:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(2n)]:sm:border-r-0 [&>*:nth-child(3n)]:lg:border-r-0 [&>*]:opacity-0">
                  {buyData.deals.map((deal, idx) => (
                    <div
                      key={`${deal.url}-${idx}`}
                      className="border-r border-b border-[#2a2520] bg-black"
                    >
                      <DealCard deal={deal} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[#2a2520] py-10 text-center">
                  <p className="text-xs text-[#6b6560]">
                    NO DEALS BELOW 15% MARKET VALUE
                  </p>
                  <p className="mt-1 text-[10px] text-[#5a544e]">
                    Deals = listings 15%+ below fair value (scams & mismatches filtered)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== SELL MODE ==================== */}
        {mode === "sell" && sellData && showResults && !isLoading && (
          <div className="animate-in-section">
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
            imagePreview={imagePreview}
            conditionResult={conditionResult}
            onImagePreviewChange={setImagePreview}
            refinementSelections={refinementSelections}
          />
          </div>
        )}

        {/* Empty State: vertically and horizontally centered in remaining space */}
        {!hasData && !isLoading && !error && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
            <div className="animate-in-section mx-auto max-w-lg text-center">
              <DollarSign className="mx-auto mb-4 h-10 w-10 text-[#2a2520]" />
              <div className="text-base font-bold tracking-tight text-[#39ff14]">
                {mode === "buy" ? "READY TO SCAN" : "READY TO PRICE"}
              </div>
              <p className="mt-2 text-sm text-[#6b6560]">
                {mode === "buy"
                  ? "ENTER A PRODUCT ABOVE TO DISCOVER UNDERPRICED LISTINGS"
                  : "ENTER YOUR PRODUCT ABOVE FOR MARKET-BACKED PRICING"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer: sticks to bottom of viewport */}
      <footer className="shrink-0 border-t border-[#2a2520] py-3 text-center text-[10px] text-[#6b6560]">
        Find underpriced listings · Price with confidence · Second Hand MarketMaker
      </footer>
      </div>
    </div>
  );
}
