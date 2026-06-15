"use client";

import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import { Plus, X } from "lucide-react";

const OPERATORS = [
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "in",
  "!in",
  "has",
  "!has",
] as const;
type Operator = (typeof OPERATORS)[number];

interface Condition {
  property: string;
  operator: Operator;
  value: string;
}

type CombiningOp = "all" | "any" | "none";

interface VisualFilterBuilderProps {
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Try to parse a MapLibre filter into visual conditions. Returns null if unparseable. */
function parseFilter(
  filter: unknown,
): { combining: CombiningOp; conditions: Condition[] } | null {
  if (!Array.isArray(filter) || filter.length === 0) return null;

  const op = filter[0];

  // Single condition: ["==", "prop", "val"]
  if (OPERATORS.includes(op)) {
    return {
      combining: "all",
      conditions: [parseCondition(filter)].filter(Boolean) as Condition[],
    };
  }

  // Combining: ["all", [...], [...]]
  if (op === "all" || op === "any" || op === "none") {
    const conditions = filter
      .slice(1)
      .map(parseCondition)
      .filter(Boolean) as Condition[];
    if (conditions.length !== filter.length - 1) return null; // some unparseable
    return { combining: op as CombiningOp, conditions };
  }

  return null;
}

function parseCondition(cond: unknown): Condition | null {
  if (!Array.isArray(cond) || cond.length < 2) return null;
  const op = cond[0] as Operator;
  if (!OPERATORS.includes(op)) return null;

  if (op === "has" || op === "!has") {
    return { property: String(cond[1] ?? ""), operator: op, value: "" };
  }

  if (op === "in" || op === "!in") {
    return {
      property: String(cond[1] ?? ""),
      operator: op,
      value: cond.slice(2).map(String).join(", "),
    };
  }

  return {
    property: String(cond[1] ?? ""),
    operator: op,
    value: String(cond[2] ?? ""),
  };
}

function buildFilter(combining: CombiningOp, conditions: Condition[]): unknown {
  if (conditions.length === 0) return undefined;

  const filters = conditions.map((c) => {
    if (c.operator === "has" || c.operator === "!has") {
      return [c.operator, c.property];
    }
    if (c.operator === "in" || c.operator === "!in") {
      const values = c.value.split(",").map((v) => {
        const trimmed = v.trim();
        const num = Number(trimmed);
        return isNaN(num) ? trimmed : num;
      });
      return [c.operator, c.property, ...values];
    }
    const numVal = Number(c.value);
    const val = isNaN(numVal) ? c.value : numVal;
    return [c.operator, c.property, val];
  });

  if (filters.length === 1 && combining === "all") return filters[0];
  return [combining, ...filters];
}

export function VisualFilterBuilder({
  value,
  onChange,
}: VisualFilterBuilderProps) {
  const parsed = parseFilter(value);

  // If we can't parse it, caller should fall back to JSON
  if (!parsed && value !== undefined) return null;

  const { combining, conditions } = parsed ?? {
    combining: "all" as CombiningOp,
    conditions: [],
  };

  const update = (newCombining: CombiningOp, newConditions: Condition[]) => {
    onChange(buildFilter(newCombining, newConditions));
  };

  const addCondition = () => {
    update(combining, [
      ...conditions,
      { property: "", operator: "==", value: "" },
    ]);
  };

  const removeCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    update(combining, next);
  };

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    const next = conditions.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    update(combining, next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {conditions.length > 1 && (
        <Select
          value={combining}
          onValueChange={(v) => update(v as CombiningOp, conditions)}
        >
          <SelectTrigger className="h-5 w-20 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[10px]">
              all
            </SelectItem>
            <SelectItem value="any" className="text-[10px]">
              any
            </SelectItem>
            <SelectItem value="none" className="text-[10px]">
              none
            </SelectItem>
          </SelectContent>
        </Select>
      )}

      {conditions.map((cond, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            value={cond.property}
            onChange={(e) => updateCondition(i, { property: e.target.value })}
            className="h-5 flex-1 text-[10px] font-mono"
            placeholder="property"
          />
          <Select
            value={cond.operator}
            onValueChange={(v) =>
              updateCondition(i, { operator: v as Operator })
            }
          >
            <SelectTrigger className="h-5 w-14 text-[10px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem
                  key={op}
                  value={op}
                  className="text-[10px] font-mono"
                >
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cond.operator !== "has" && cond.operator !== "!has" && (
            <Input
              value={cond.value}
              onChange={(e) => updateCondition(i, { value: e.target.value })}
              className="h-5 flex-1 text-[10px] font-mono"
              placeholder="value"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 shrink-0"
            onClick={() => removeCondition(i)}
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-5 text-[10px] gap-1"
        onClick={addCondition}
      >
        <Plus className="h-2.5 w-2.5" /> Add condition
      </Button>
    </div>
  );
}

/** Returns true if the filter can be represented visually */
export function canParseFilter(value: unknown): boolean {
  if (value === undefined) return true;
  return parseFilter(value) !== null;
}
