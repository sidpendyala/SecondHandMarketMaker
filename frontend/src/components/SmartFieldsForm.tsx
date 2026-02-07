"use client";

import { useState, useCallback, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProductField } from "@/lib/types";

interface SmartFieldsFormProps {
  fields: ProductField[];
  isLoading: boolean;
  onChange: (values: Record<string, string>) => void;
  prefilled?: Record<string, string>;
}

export default function SmartFieldsForm({
  fields,
  isLoading,
  onChange,
  prefilled,
}: SmartFieldsFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  // Reset values when fields change
  useEffect(() => {
    setValues({});
  }, [fields]);

  // Apply prefilled values from AI detection
  useEffect(() => {
    if (!prefilled || Object.keys(prefilled).length === 0) return;
    if (fields.length === 0) return;

    // Match AI-detected attributes to field keys (fuzzy: try key match and name match)
    const matched: Record<string, string> = {};
    for (const field of fields) {
      const keyLower = field.key.toLowerCase();
      const nameLower = field.name.toLowerCase();

      for (const [attrKey, attrVal] of Object.entries(prefilled)) {
        const akLower = attrKey.toLowerCase().replace(/[_\s-]/g, "");
        const fkLower = keyLower.replace(/[_\s-]/g, "");
        const fnLower = nameLower.replace(/[_\s-]/g, "");

        if (akLower === fkLower || akLower === fnLower || fkLower.includes(akLower) || akLower.includes(fkLower)) {
          // For select fields, try to find a matching option
          if (field.type === "select" && field.options.length > 0) {
            const valLower = attrVal.toLowerCase();
            const matchedOpt = field.options.find(
              (opt) =>
                opt.toLowerCase() === valLower ||
                opt.toLowerCase().includes(valLower) ||
                valLower.includes(opt.toLowerCase())
            );
            if (matchedOpt) {
              matched[field.key] = matchedOpt;
            }
          } else if (field.type === "boolean") {
            const yes = ["yes", "true", "1"].includes(attrVal.toLowerCase());
            matched[field.key] = yes ? "Yes" : "No";
          }
          break;
        }
      }
    }

    if (Object.keys(matched).length > 0) {
      setValues((prev) => {
        const next = { ...prev, ...matched };
        // Only fire onChange if something actually changed
        const changed = Object.keys(matched).some((k) => prev[k] !== matched[k]);
        if (changed) {
          // Defer to avoid render-during-render
          setTimeout(() => onChange(next), 0);
        }
        return next;
      });
    }
  }, [prefilled, fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (key: string, value: string) => {
      const next = { ...values, [key]: value };
      setValues(next);
      onChange(next);
    },
    [values, onChange]
  );

  return (
    <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            <Sparkles className="mr-1.5 inline-block h-4 w-4" />
            Product Details
          </h4>
          <Badge
            variant="outline"
            className="border-purple-500/20 bg-purple-500/10 text-[10px] text-purple-500"
          >
            AI Generated
          </Badge>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-9 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : fields.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No product fields available.
          </p>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {field.name}
                </label>

                {field.type === "boolean" ? (
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={values[field.key] === "Yes"}
                      onChange={(e) =>
                        handleChange(
                          field.key,
                          e.target.checked ? "Yes" : "No"
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {field.name}
                    </span>
                  </label>
                ) : (
                  <select
                    value={values[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <option value="">Select {field.name.toLowerCase()}...</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
