import { ConditionNode, JsonValue } from "../domain/models";

const getValueByPath = (
  context: Record<string, JsonValue>,
  path: string
): JsonValue | undefined => {
  const segments = path.split(".");
  let current: JsonValue | undefined = context;

  for (const segment of segments) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return undefined;
    }

    current = (current as Record<string, JsonValue>)[segment];
  }

  return current;
};

const asArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];

const compare = (
  actualValue: JsonValue | undefined,
  comparator: ConditionNode & { op: "match" }
): boolean => {
  switch (comparator.comparator) {
    case "exists":
      return typeof actualValue !== "undefined";
    case "eq":
      return actualValue === comparator.value;
    case "ne":
      return actualValue !== comparator.value;
    case "in":
      return asArray(comparator.value).includes(actualValue as JsonValue);
    case "not_in":
      return !asArray(comparator.value).includes(actualValue as JsonValue);
    case "gt":
      return typeof actualValue === "number" && typeof comparator.value === "number"
        ? actualValue > comparator.value
        : false;
    case "gte":
      return typeof actualValue === "number" && typeof comparator.value === "number"
        ? actualValue >= comparator.value
        : false;
    case "lt":
      return typeof actualValue === "number" && typeof comparator.value === "number"
        ? actualValue < comparator.value
        : false;
    case "lte":
      return typeof actualValue === "number" && typeof comparator.value === "number"
        ? actualValue <= comparator.value
        : false;
    case "contains":
      return typeof actualValue === "string" && typeof comparator.value === "string"
        ? actualValue.includes(comparator.value)
        : false;
    case "starts_with":
      return typeof actualValue === "string" && typeof comparator.value === "string"
        ? actualValue.startsWith(comparator.value)
        : false;
    case "ends_with":
      return typeof actualValue === "string" && typeof comparator.value === "string"
        ? actualValue.endsWith(comparator.value)
        : false;
    default:
      return false;
  }
};

export const evaluateCondition = (
  node: ConditionNode,
  context: Record<string, JsonValue>
): boolean => {
  switch (node.op) {
    case "all":
      return node.conditions.every((condition) => evaluateCondition(condition, context));
    case "any":
      return node.conditions.some((condition) => evaluateCondition(condition, context));
    case "not":
      return !evaluateCondition(node.condition, context);
    case "match":
      return compare(getValueByPath(context, node.attribute), node);
    default:
      return false;
  }
};
