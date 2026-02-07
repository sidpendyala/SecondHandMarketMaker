"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  const currentSellQuery = useRef<string>("");

  const handleSearch = useCallback(
    async (query: string, keepImage = false) => {
      setIsLoading(true);
      setShowResults(false);
      setError(null);
      setBuyData(null);
      setSellData(null);
      setProductFields([]);
      setShowFiltered(false);

      if (!keepImage) {
        setSellCondition(undefined);
        setSellDetails({});
        setDetectedAttrs({});
        setImagePreview(null);
        setConditionResult(null);
      }

      try {
        if (mode === "buy") {
          const result = await analyzeProduct(query);
          setBuyData(result);
        } else {
          currentSellQuery.current = query;

          const [advisorResult, fieldsResult] = await Promise.allSettled([
            sellAdvisor(
              query,
              keepImage ? sellCondition : undefined,
              keepImage ? sellDetails : undefined
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

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode);
    setBuyData(null);
    setSellData(null);
    setError(null);
    setProductFields([]);
    setSellCondition(undefined);
    setSellDetails({});
    setDetectedAttrs({});
    setImagePreview(null);
    setConditionResult(null);
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSellAdvisor = useCallback(
    (condition?: number, details?: Record<string, string>) => {
      const query = currentSellQuery.current;
      if (!query) return;

      setPriceRefreshing(true);

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(async () => {
        try {
          const result = await sellAdvisor(query, condition, details);
          setSellData(result);
        } catch {
          // silent
        } finally {
          setPriceRefreshing(false);
        }
      }, 800);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const handleSellCondition = useCallback(
    (result: ConditionResult) => {
      setSellCondition(result.rating);
      setConditionResult(result);
      refreshSellAdvisor(result.rating, sellDetails);

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
      setSellDetails(values);
      refreshSellAdvisor(sellCondition, values);
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
    <div className="min-h-screen bg-black">
      {/* Terminal Header */}
      <SearchHeader
        onSearch={handleSearch}
        isLoading={isLoading}
        mode={mode}
        onModeChange={handleModeChange}
        externalQuery={searchBarQuery}
      />

      {/* Main */}
      <div className="py-4">
        <ProgressLoader
          isLoading={isLoading}
          mode={mode}
          onComplete={() => setShowResults(true)}
        />

        {/* Error */}
        {error && !isLoading && (
          <div className="mx-auto max-w-md px-4 py-12 text-center">
            <Frown className="mx-auto mb-2 h-6 w-6 text-[#ff3333]" />
            <div className="text-xs font-bold text-[#ff3333]">
              ANALYSIS FAILED
            </div>
            <p className="mt-1 text-[11px] text-[#6b6560]">{error}</p>
          </div>
        )}

        {/* ==================== BUY MODE ==================== */}
        {mode === "buy" && buyData && showResults && (
          <>
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
                    <div className="border-t border-[#2a2520]">
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
                  ARBITRAGE OPPORTUNITIES
                </span>
                <span className="text-[10px] text-[#6b6560]">
                  {buyData.deals.length} DEALS
                </span>
              </div>

              {buyData.deals.length > 0 ? (
                <div className="grid grid-cols-1 gap-px bg-[#2a2520] sm:grid-cols-2 lg:grid-cols-3">
                  {buyData.deals.map((deal, idx) => (
                    <div key={`${deal.url}-${idx}`} className="bg-black">
                      <DealCard deal={deal} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-[#2a2520] py-10 text-center">
                  <p className="text-xs text-[#6b6560]">
                    NO DEALS BELOW 20% MARKET VALUE
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ==================== SELL MODE ==================== */}
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
            imagePreview={imagePreview}
            conditionResult={conditionResult}
            onImagePreviewChange={setImagePreview}
          />
        )}

        {/* Empty State */}
        {!hasData && !isLoading && !error && (
          <div className="mx-auto max-w-md px-4 py-14 text-center">
            <DollarSign className="mx-auto mb-2 h-6 w-6 text-[#2a2520]" />
            <div className="text-xs font-bold text-[#39ff14]">
              {mode === "buy" ? "READY TO SCAN" : "READY TO PRICE"}
            </div>
            <p className="mt-1 text-[10px] text-[#6b6560]">
              {mode === "buy"
                ? "ENTER A PRODUCT ABOVE TO DISCOVER UNDERPRICED LISTINGS"
                : "ENTER YOUR PRODUCT ABOVE FOR MARKET-BACKED PRICING"}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#2a2520] py-3 text-center text-[10px] text-[#6b6560]">
        MARKETMAKER — AI-POWERED DEAL INTELLIGENCE — NOT FINANCIAL ADVICE
      </footer>
    </div>
  );
}
