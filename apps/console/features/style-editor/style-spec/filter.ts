export const LEGACY_FILTER_OPERATORS = [
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

export type LegacyFilterOperator = (typeof LEGACY_FILTER_OPERATORS)[number];
export type LegacyFilterCombining = "all" | "any" | "none";
export type LegacyFilterScalar = string | number | boolean | null;

export interface LegacyFilterCondition {
  property: string;
  operator: LegacyFilterOperator;
  value: LegacyFilterScalar | LegacyFilterScalar[];
}

export interface ParsedLegacyFilter {
  combining: LegacyFilterCombining;
  conditions: LegacyFilterCondition[];
}

export function parseLegacyFilter(filter: unknown): ParsedLegacyFilter | null {
  if (!Array.isArray(filter) || filter.length === 0) return null;
  const op = filter[0];

  if (isLegacyOperator(op)) {
    const condition = parseCondition(filter);
    return condition ? { combining: "all", conditions: [condition] } : null;
  }
  if (op !== "all" && op !== "any" && op !== "none") return null;
  const conditions = filter.slice(1).map(parseCondition);
  return conditions.every(
    (condition): condition is LegacyFilterCondition => condition !== null,
  )
    ? { combining: op, conditions }
    : null;
}

export function buildLegacyFilter(
  combining: LegacyFilterCombining,
  conditions: LegacyFilterCondition[],
): unknown {
  if (conditions.length === 0) return undefined;
  const filters = conditions.map((condition) => {
    if (condition.operator === "has" || condition.operator === "!has") {
      return [condition.operator, condition.property];
    }
    if (condition.operator === "in" || condition.operator === "!in") {
      const values = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return [condition.operator, condition.property, ...values];
    }
    return [condition.operator, condition.property, condition.value];
  });
  return filters.length === 1 && combining === "all"
    ? filters[0]
    : [combining, ...filters];
}

export function formatLegacyFilterValue(
  value: LegacyFilterScalar | LegacyFilterScalar[],
) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function parseLegacyFilterValue(
  input: string,
  list: boolean,
): LegacyFilterScalar | LegacyFilterScalar[] {
  if (input === "") return list ? [""] : "";
  try {
    const parsed: unknown = JSON.parse(input);
    if (list && Array.isArray(parsed) && parsed.every(isLegacyScalar)) {
      return parsed;
    }
    if (!list && isLegacyScalar(parsed)) return parsed;
  } catch {
    // Plain text remains a string.
  }
  return list ? [input] : input;
}

function parseCondition(condition: unknown): LegacyFilterCondition | null {
  if (!Array.isArray(condition) || condition.length < 2) return null;
  const operator = condition[0];
  const property = condition[1];
  if (!isLegacyOperator(operator) || typeof property !== "string") return null;

  if (operator === "has" || operator === "!has") {
    return condition.length === 2
      ? { property, operator, value: null }
      : null;
  }
  if (operator === "in" || operator === "!in") {
    const values = condition.slice(2);
    return values.length > 0 && values.every(isLegacyScalar)
      ? { property, operator, value: values }
      : null;
  }
  return condition.length === 3 && isLegacyScalar(condition[2])
    ? { property, operator, value: condition[2] }
    : null;
}

function isLegacyOperator(value: unknown): value is LegacyFilterOperator {
  return LEGACY_FILTER_OPERATORS.includes(value as LegacyFilterOperator);
}

function isLegacyScalar(value: unknown): value is LegacyFilterScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
