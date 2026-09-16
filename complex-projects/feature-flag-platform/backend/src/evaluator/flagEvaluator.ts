import { EvaluationResult, Flag, JsonValue } from "../domain/models";
import { evaluateCondition } from "./conditionEvaluator";

export const evaluateFlag = (
  flag: Flag,
  context: Record<string, JsonValue>
): EvaluationResult => {
  if (!flag.enabled) {
    return {
      flagKey: flag.key,
      enabled: false,
      matched: false,
      variant: flag.defaultVariant,
      value: flag.defaultValue
    };
  }

  for (const rule of flag.targetingRules) {
    if (evaluateCondition(rule.condition, context)) {
      return {
        flagKey: flag.key,
        enabled: true,
        matched: true,
        variant: rule.variant,
        value: rule.value,
        ruleId: rule.id
      };
    }
  }

  return {
    flagKey: flag.key,
    enabled: true,
    matched: false,
    variant: flag.defaultVariant,
    value: flag.defaultValue
  };
};
