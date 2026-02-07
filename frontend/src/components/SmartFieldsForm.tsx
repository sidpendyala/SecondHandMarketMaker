"use client";

import { useState, useCallback, useEffect } from "react";
import type { ProductField } from "@/lib/types";
import { DropdownSelect } from "@/components/ui/dropdown-select";

interface SmartFieldsFormProps {
  fields: ProductField[];
  isLoading: boolean;
  onChange: (values: Record<string, string>) => void;
  prefilled?: Record<string, string>;
  /** Keys already provided (e.g. from loading-screen refinement); these fields are hidden */
  refinementSelections?: Record<string, string>;
}

export default function SmartFieldsForm({
  fields,
  isLoading,
  onChange,
  prefilled,
  refinementSelections,
}: SmartFieldsFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  // Don't ask again for attributes already chosen in the loading-screen refinement
  const refinementKeysLower = refinementSelections
    ? new Set(
        Object.keys(refinementSelections).map((k) => k.toLowerCase().trim())
      )
    : new Set<string>();
  const visibleFields = refinementSelections
    ? fields.filter(
        (f) => !refinementKeysLower.has(f.key.toLowerCase().trim())
      )
    : fields;

  useEffect(() => {
    setValues({});
  }, [fields]);

  useEffect(() => {
    if (!prefilled || Object.keys(prefilled).length === 0) return;
    if (fields.length === 0) return;

    const matched: Record<string, string> = {};
    for (const field of fields) {
      const keyLower = field.key.toLowerCase();
      const nameLower = field.name.toLowerCase();

      for (const [attrKey, attrVal] of Object.entries(prefilled)) {
        const akLower = attrKey.toLowerCase().replace(/[_\s-]/g, "");
        const fkLower = keyLower.replace(/[_\s-]/g, "");
        const fnLower = nameLower.replace(/[_\s-]/g, "");

        if (
          akLower === fkLower ||
          akLower === fnLower ||
          fkLower.includes(akLower) ||
          akLower.includes(fkLower)
        ) {
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
        const changed = Object.keys(matched).some(
          (k) => prev[k] !== matched[k]
        );
        if (changed) {
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
    <div className="border border-[#2a2520] bg-[#0d0b09] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold text-[#39ff14]">
          PRODUCT DETAILS
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 animate-pulse bg-[#2a2520]" />
              <div className="h-7 w-full animate-pulse bg-[#2a2520]" />
            </div>
          ))}
        </div>
      ) : visibleFields.length === 0 ? (
        <p className="py-4 text-center text-[10px] text-[#6b6560]">
          {fields.length === 0
            ? "NO FIELDS AVAILABLE"
            : "ALL DETAILS SET (FROM REFINEMENT)"}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleFields.map((field) => (
            <div key={field.key}>
              <label className="mb-0.5 block text-[10px] text-[#6b6560]">
                {field.name.toUpperCase()}
              </label>

              {field.type === "boolean" ? (
                <label className="flex cursor-pointer items-center gap-2 border border-[#2a2520] bg-black px-2.5 py-2 hover:border-[#6b6560]">
                  <input
                    type="checkbox"
                    checked={values[field.key] === "Yes"}
                    onChange={(e) =>
                      handleChange(
                        field.key,
                        e.target.checked ? "Yes" : "No"
                      )
                    }
                    aria-label={field.name}
                    className="h-4 w-4 accent-[#39ff14]"
                  />
                  <span className="text-[11px] text-[#e8e6e3]">
                    {field.name}
                  </span>
                </label>
              ) : (
                <DropdownSelect
                  value={values[field.key] || ""}
                  onValueChange={(v) => handleChange(field.key, v)}
                  options={field.options}
                  placeholder="SELECT..."
                  size="sm"
                  aria-label={field.name}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
