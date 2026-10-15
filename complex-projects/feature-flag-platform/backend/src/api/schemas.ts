import { z } from "zod";
import { ConditionNode, JsonValue } from "../domain/models";

const keySchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Key must contain only letters, digits, underscore, or hyphen"
  );

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

export const projectCreateSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional()
});

export const projectUpdateSchema = z.object({
  key: keySchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional()
});

export const environmentCreateSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(120)
});

export const environmentUpdateSchema = z.object({
  key: keySchema.optional(),
  name: z.string().min(1).max(120).optional()
});

const comparatorSchema = z.enum([
  "eq",
  "ne",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "starts_with",
  "ends_with",
  "exists"
]);

const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({
      op: z.literal("all"),
      conditions: z.array(conditionNodeSchema).min(1)
    }),
    z.object({
      op: z.literal("any"),
      conditions: z.array(conditionNodeSchema).min(1)
    }),
    z.object({
      op: z.literal("not"),
      condition: conditionNodeSchema
    }),
    z.object({
      op: z.literal("match"),
      attribute: z.string().min(1),
      comparator: comparatorSchema,
      value: jsonValueSchema.optional()
    })
  ])
);

const targetingRuleSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().max(120).optional(),
  condition: conditionNodeSchema,
  variant: z.string().min(1),
  value: jsonValueSchema
});

export const flagCreateSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  defaultVariant: z.string().min(1),
  defaultValue: jsonValueSchema,
  targetingRules: z.array(targetingRuleSchema).default([])
});

export const flagUpdateSchema = z.object({
  key: keySchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  defaultVariant: z.string().min(1).optional(),
  defaultValue: jsonValueSchema.optional(),
  targetingRules: z.array(targetingRuleSchema).optional()
});

export const evaluateFlagSchema = z.object({
  context: z.record(z.string(), jsonValueSchema).default({})
});

export const ingestEventSchema = z.object({
  type: z.enum(["impression", "conversion"]),
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  flagKey: z.string().min(1),
  variant: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  context: z.record(z.string(), jsonValueSchema).optional(),
  properties: z.record(z.string(), jsonValueSchema).optional()
});
