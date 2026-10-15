import { describe, expect, it } from "vitest";
import { Flag } from "../src/domain/models";
import { evaluateFlag } from "../src/evaluator/flagEvaluator";

const baseFlag: Flag = {
  id: "flag-1",
  projectId: "project-1",
  environmentId: "env-1",
  key: "checkout_flow",
  name: "Checkout Flow",
  enabled: true,
  defaultVariant: "control",
  defaultValue: false,
  targetingRules: [
    {
      id: "rule-1",
      variant: "vip",
      value: true,
      condition: {
        op: "all",
        conditions: [
          {
            op: "match",
            attribute: "user.plan",
            comparator: "eq",
            value: "enterprise"
          },
          {
            op: "match",
            attribute: "request.country",
            comparator: "in",
            value: ["US", "CA"]
          }
        ]
      }
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("evaluateFlag", () => {
  it("returns matching rule variant when context matches", () => {
    const result = evaluateFlag(baseFlag, {
      user: { plan: "enterprise" },
      request: { country: "US" }
    });

    expect(result.enabled).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.variant).toBe("vip");
    expect(result.value).toBe(true);
    expect(result.ruleId).toBe("rule-1");
  });

  it("falls back to default when no rules match", () => {
    const result = evaluateFlag(baseFlag, {
      user: { plan: "free" },
      request: { country: "DE" }
    });

    expect(result.enabled).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.variant).toBe("control");
    expect(result.value).toBe(false);
  });

  it("returns default when flag is disabled", () => {
    const disabled = {
      ...baseFlag,
      enabled: false
    };

    const result = evaluateFlag(disabled, {
      user: { plan: "enterprise" },
      request: { country: "US" }
    });

    expect(result.enabled).toBe(false);
    expect(result.matched).toBe(false);
    expect(result.variant).toBe("control");
    expect(result.value).toBe(false);
  });
});
