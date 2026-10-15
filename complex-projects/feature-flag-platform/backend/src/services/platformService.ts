import { randomUUID } from "crypto";
import { AppError } from "../domain/errors";
import {
  ConditionNode,
  Environment,
  EvaluationResult,
  Flag,
  FlagEvent,
  JsonValue,
  Project,
  TargetingRule
} from "../domain/models";
import { evaluateFlag } from "../evaluator/flagEvaluator";
import { RepositoryBundle } from "../repositories/interfaces";

type CreateProjectInput = Pick<Project, "key" | "name" | "description">;
type UpdateProjectInput = Partial<CreateProjectInput>;
type CreateEnvironmentInput = Pick<Environment, "key" | "name">;
type UpdateEnvironmentInput = Partial<CreateEnvironmentInput>;
type TargetingRuleInput = {
  id?: string;
  name?: string;
  condition: ConditionNode;
  variant: string;
  value: JsonValue;
};
type CreateFlagInput = {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  defaultVariant: string;
  defaultValue: JsonValue;
  targetingRules: TargetingRuleInput[];
};
type UpdateFlagInput = Partial<CreateFlagInput>;
type IngestEventInput = Omit<FlagEvent, "id" | "timestamp"> & { timestamp?: string };

const now = (): string => new Date().toISOString();

const normalizeRules = (rules: TargetingRuleInput[]): TargetingRule[] =>
  rules.map((rule) => ({
    ...rule,
    id: rule.id || randomUUID()
  }));

export class PlatformService {
  constructor(private readonly repos: RepositoryBundle) {}

  async createProject(input: CreateProjectInput): Promise<Project> {
    const existing = await this.repos.projects.getByKey(input.key);
    if (existing) {
      throw new AppError(`Project key '${input.key}' already exists`, 409);
    }

    const timestamp = now();
    const project: Project = {
      id: randomUUID(),
      key: input.key,
      name: input.name,
      description: input.description,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return this.repos.projects.create(project);
  }

  async listProjects(): Promise<Project[]> {
    return this.repos.projects.list();
  }

  async getProject(projectId: string): Promise<Project> {
    const project = await this.repos.projects.getById(projectId);
    if (!project) {
      throw new AppError("Project not found", 404);
    }
    return project;
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    const existing = await this.getProject(projectId);
    if (input.key && input.key !== existing.key) {
      const conflict = await this.repos.projects.getByKey(input.key);
      if (conflict) {
        throw new AppError(`Project key '${input.key}' already exists`, 409);
      }
    }

    const updated: Project = {
      ...existing,
      ...input,
      updatedAt: now()
    };
    return this.repos.projects.update(updated);
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.getProject(projectId);
    const environments = await this.repos.environments.listByProject(projectId);
    for (const environment of environments) {
      const flags = await this.repos.flags.listByEnvironment(environment.id);
      for (const flag of flags) {
        await this.repos.flags.delete(flag.id);
      }
      await this.repos.environments.delete(environment.id);
    }
    await this.repos.projects.delete(projectId);
  }

  async createEnvironment(
    projectId: string,
    input: CreateEnvironmentInput
  ): Promise<Environment> {
    await this.getProject(projectId);
    const existing = await this.repos.environments.getByKey(projectId, input.key);
    if (existing) {
      throw new AppError(`Environment key '${input.key}' already exists`, 409);
    }

    const timestamp = now();
    const environment: Environment = {
      id: randomUUID(),
      projectId,
      key: input.key,
      name: input.name,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.repos.environments.create(environment);
  }

  async listEnvironments(projectId: string): Promise<Environment[]> {
    await this.getProject(projectId);
    return this.repos.environments.listByProject(projectId);
  }

  async getEnvironment(projectId: string, environmentId: string): Promise<Environment> {
    await this.getProject(projectId);
    const environment = await this.repos.environments.getById(environmentId);
    if (!environment || environment.projectId !== projectId) {
      throw new AppError("Environment not found", 404);
    }
    return environment;
  }

  async updateEnvironment(
    projectId: string,
    environmentId: string,
    input: UpdateEnvironmentInput
  ): Promise<Environment> {
    const existing = await this.getEnvironment(projectId, environmentId);
    if (input.key && input.key !== existing.key) {
      const conflict = await this.repos.environments.getByKey(projectId, input.key);
      if (conflict) {
        throw new AppError(`Environment key '${input.key}' already exists`, 409);
      }
    }

    const updated: Environment = {
      ...existing,
      ...input,
      updatedAt: now()
    };
    return this.repos.environments.update(updated);
  }

  async deleteEnvironment(projectId: string, environmentId: string): Promise<void> {
    await this.getEnvironment(projectId, environmentId);
    const flags = await this.repos.flags.listByEnvironment(environmentId);
    for (const flag of flags) {
      await this.repos.flags.delete(flag.id);
    }
    await this.repos.environments.delete(environmentId);
  }

  async createFlag(
    projectId: string,
    environmentId: string,
    input: CreateFlagInput
  ): Promise<Flag> {
    await this.getEnvironment(projectId, environmentId);
    const existing = await this.repos.flags.getByKey(environmentId, input.key);
    if (existing) {
      throw new AppError(`Flag key '${input.key}' already exists`, 409);
    }

    const timestamp = now();
    const flag: Flag = {
      id: randomUUID(),
      projectId,
      environmentId,
      key: input.key,
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      defaultVariant: input.defaultVariant,
      defaultValue: input.defaultValue,
      targetingRules: normalizeRules(input.targetingRules),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    return this.repos.flags.create(flag);
  }

  async listFlags(projectId: string, environmentId: string): Promise<Flag[]> {
    await this.getEnvironment(projectId, environmentId);
    return this.repos.flags.listByEnvironment(environmentId);
  }

  async getFlag(projectId: string, environmentId: string, flagId: string): Promise<Flag> {
    await this.getEnvironment(projectId, environmentId);
    const flag = await this.repos.flags.getById(flagId);
    if (!flag || flag.environmentId !== environmentId) {
      throw new AppError("Flag not found", 404);
    }
    return flag;
  }

  async updateFlag(
    projectId: string,
    environmentId: string,
    flagId: string,
    input: UpdateFlagInput
  ): Promise<Flag> {
    const existing = await this.getFlag(projectId, environmentId, flagId);
    if (input.key && input.key !== existing.key) {
      const conflict = await this.repos.flags.getByKey(environmentId, input.key);
      if (conflict) {
        throw new AppError(`Flag key '${input.key}' already exists`, 409);
      }
    }

    const updated: Flag = {
      ...existing,
      ...input,
      targetingRules: input.targetingRules
        ? normalizeRules(input.targetingRules)
        : existing.targetingRules,
      updatedAt: now()
    };
    return this.repos.flags.update(updated);
  }

  async deleteFlag(projectId: string, environmentId: string, flagId: string): Promise<void> {
    await this.getFlag(projectId, environmentId, flagId);
    await this.repos.flags.delete(flagId);
  }

  async evaluateByFlagKey(
    projectId: string,
    environmentId: string,
    flagKey: string,
    context: Record<string, JsonValue>
  ): Promise<EvaluationResult> {
    await this.getEnvironment(projectId, environmentId);
    const flag = await this.repos.flags.getByKey(environmentId, flagKey);
    if (!flag) {
      throw new AppError("Flag not found", 404);
    }
    return evaluateFlag(flag, context);
  }

  async ingestEvent(input: IngestEventInput): Promise<FlagEvent> {
    const project = await this.repos.projects.getById(input.projectId);
    if (!project) {
      throw new AppError("Project not found for event ingestion", 404);
    }

    const environment = await this.repos.environments.getById(input.environmentId);
    if (!environment || environment.projectId !== project.id) {
      throw new AppError("Environment not found for event ingestion", 404);
    }

    const flag = await this.repos.flags.getByKey(environment.id, input.flagKey);
    if (!flag) {
      throw new AppError("Flag not found for event ingestion", 404);
    }

    const event: FlagEvent = {
      id: randomUUID(),
      ...input,
      timestamp: input.timestamp ?? now()
    };

    return this.repos.events.ingest(event);
  }
}
