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
import {
  buildLegacyFilter,
  formatLegacyFilterValue,
  LEGACY_FILTER_OPERATORS,
  parseLegacyFilter,
  parseLegacyFilterValue,
  type LegacyFilterCombining,
  type LegacyFilterCondition,
  type LegacyFilterOperator,
} from "@/features/style-editor/style-spec/filter";

interface VisualFilterBuilderProps {
  value: unknown;
  onChange: (value: unknown) => void;
}

export function VisualFilterBuilder({
  value,
  onChange,
}: VisualFilterBuilderProps) {
  const parsed = parseLegacyFilter(value);
  if (!parsed && value !== undefined) return null;
  const { combining, conditions } = parsed ?? {
    combining: "all" as LegacyFilterCombining,
    conditions: [],
  };
  const update = (
    nextCombining: LegacyFilterCombining,
    nextConditions: LegacyFilterCondition[],
  ) => onChange(buildLegacyFilter(nextCombining, nextConditions));

  return (
    <div className="flex flex-col gap-1.5">
      {conditions.length > 1 && (
        <Select
          value={combining}
          onValueChange={(next) =>
            update(next as LegacyFilterCombining, conditions)
          }
        >
          <SelectTrigger className="!h-6 w-20 rounded-md py-0 pl-2 pr-1 text-xs [&_svg]:size-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["all", "any", "none"] as const).map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="!min-h-6 py-0.5 text-xs"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {conditions.map((condition, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={condition.property}
            onChange={(event) =>
              updateCondition(index, { property: event.target.value })
            }
            className="h-5 flex-1 text-[10px] font-mono"
            placeholder="property"
          />
          <Select
            value={condition.operator}
            onValueChange={(operator) =>
              updateCondition(index, {
                operator: operator as LegacyFilterOperator,
                value:
                  operator === "in" || operator === "!in"
                    ? Array.isArray(condition.value)
                      ? condition.value
                      : [condition.value]
                    : Array.isArray(condition.value)
                      ? condition.value[0] ?? ""
                      : condition.value,
              })
            }
          >
            <SelectTrigger className="!h-6 w-14 rounded-md py-0 pl-2 pr-1 font-mono text-xs [&_svg]:size-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEGACY_FILTER_OPERATORS.map((operator) => (
                <SelectItem
                  key={operator}
                  value={operator}
                  className="!min-h-6 py-0.5 font-mono text-xs"
                >
                  {operator}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {condition.operator !== "has" && condition.operator !== "!has" && (
            <Input
              value={formatLegacyFilterValue(condition.value)}
              onChange={(event) =>
                updateCondition(index, {
                  value: parseLegacyFilterValue(
                    event.target.value,
                    condition.operator === "in" ||
                      condition.operator === "!in",
                  ),
                })
              }
              className="h-5 flex-1 text-[10px] font-mono"
              placeholder={
                condition.operator === "in" || condition.operator === "!in"
                  ? '["value", 2]'
                  : "value"
              }
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 shrink-0"
            onClick={() =>
              update(
                combining,
                conditions.filter((_, conditionIndex) => conditionIndex !== index),
              )
            }
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-5 text-[10px] gap-1"
        onClick={() =>
          update(combining, [
            ...conditions,
            { property: "", operator: "==", value: "" },
          ])
        }
      >
        <Plus className="h-2.5 w-2.5" /> Add condition
      </Button>
    </div>
  );

  function updateCondition(
    index: number,
    patch: Partial<LegacyFilterCondition>,
  ) {
    update(
      combining,
      conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    );
  }
}

export function canParseFilter(value: unknown) {
  return value === undefined || parseLegacyFilter(value) !== null;
}
