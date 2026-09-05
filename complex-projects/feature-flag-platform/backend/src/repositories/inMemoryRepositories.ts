import { Environment, Flag, FlagEvent, Project } from "../domain/models";
import {
  EnvironmentRepository,
  EventRepository,
  FlagRepository,
  ProjectRepository,
  RepositoryBundle
} from "./interfaces";

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly items = new Map<string, Project>();

  async create(project: Project): Promise<Project> {
    this.items.set(project.id, project);
    return project;
  }

  async list(): Promise<Project[]> {
    return Array.from(this.items.values());
  }

  async getById(projectId: string): Promise<Project | undefined> {
    return this.items.get(projectId);
  }

  async getByKey(key: string): Promise<Project | undefined> {
    return Array.from(this.items.values()).find((project) => project.key === key);
  }

  async update(project: Project): Promise<Project> {
    this.items.set(project.id, project);
    return project;
  }

  async delete(projectId: string): Promise<void> {
    this.items.delete(projectId);
  }
}

export class InMemoryEnvironmentRepository implements EnvironmentRepository {
  private readonly items = new Map<string, Environment>();

  async create(environment: Environment): Promise<Environment> {
    this.items.set(environment.id, environment);
    return environment;
  }

  async listByProject(projectId: string): Promise<Environment[]> {
    return Array.from(this.items.values()).filter(
      (environment) => environment.projectId === projectId
    );
  }

  async getById(environmentId: string): Promise<Environment | undefined> {
    return this.items.get(environmentId);
  }

  async getByKey(projectId: string, key: string): Promise<Environment | undefined> {
    return Array.from(this.items.values()).find(
      (environment) =>
        environment.projectId === projectId && environment.key === key
    );
  }

  async update(environment: Environment): Promise<Environment> {
    this.items.set(environment.id, environment);
    return environment;
  }

  async delete(environmentId: string): Promise<void> {
    this.items.delete(environmentId);
  }
}

export class InMemoryFlagRepository implements FlagRepository {
  private readonly items = new Map<string, Flag>();

  async create(flag: Flag): Promise<Flag> {
    this.items.set(flag.id, flag);
    return flag;
  }

  async listByEnvironment(environmentId: string): Promise<Flag[]> {
    return Array.from(this.items.values()).filter(
      (flag) => flag.environmentId === environmentId
    );
  }

  async getById(flagId: string): Promise<Flag | undefined> {
    return this.items.get(flagId);
  }

  async getByKey(environmentId: string, key: string): Promise<Flag | undefined> {
    return Array.from(this.items.values()).find(
      (flag) => flag.environmentId === environmentId && flag.key === key
    );
  }

  async update(flag: Flag): Promise<Flag> {
    this.items.set(flag.id, flag);
    return flag;
  }

  async delete(flagId: string): Promise<void> {
    this.items.delete(flagId);
  }
}

export class InMemoryEventRepository implements EventRepository {
  private readonly items: FlagEvent[] = [];

  async ingest(event: FlagEvent): Promise<FlagEvent> {
    this.items.push(event);
    return event;
  }

  async list(): Promise<FlagEvent[]> {
    return [...this.items];
  }
}

export const createInMemoryRepositories = (): RepositoryBundle => ({
  projects: new InMemoryProjectRepository(),
  environments: new InMemoryEnvironmentRepository(),
  flags: new InMemoryFlagRepository(),
  events: new InMemoryEventRepository()
});
