export type Primitive = string | number | boolean | null;
export type JsonValue =
  | Primitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type Comparator =
  | "eq"
  | "ne"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "exists";

export type ConditionNode =
  | {
      op: "all";
      conditions: ConditionNode[];
    }
  | {
      op: "any";
      conditions: ConditionNode[];
    }
  | {
      op: "not";
      condition: ConditionNode;
    }
  | {
      op: "match";
      attribute: string;
      comparator: Comparator;
      value?: JsonValue;
    };

export interface TargetingRule {
  id: string;
  name?: string;
  condition: ConditionNode;
  variant: string;
  value: JsonValue;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Flag {
  id: string;
  projectId: string;
  environmentId: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  defaultVariant: string;
  defaultValue: JsonValue;
  targetingRules: TargetingRule[];
  createdAt: string;
  updatedAt: string;
}

export type EventType = "impression" | "conversion";

export interface FlagEvent {
  id: string;
  type: EventType;
  timestamp: string;
  projectId: string;
  environmentId: string;
  flagKey: string;
  variant?: string;
  context?: Record<string, JsonValue>;
  properties?: Record<string, JsonValue>;
}

export interface EvaluationResult {
  flagKey: string;
  enabled: boolean;
  matched: boolean;
  variant: string;
  value: JsonValue;
  ruleId?: string;
}
