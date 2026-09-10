import { Environment, Flag, FlagEvent, Project } from "../domain/models";

export interface ProjectRepository {
  create(project: Project): Promise<Project>;
  list(): Promise<Project[]>;
  getById(projectId: string): Promise<Project | undefined>;
  getByKey(key: string): Promise<Project | undefined>;
  update(project: Project): Promise<Project>;
  delete(projectId: string): Promise<void>;
}

export interface EnvironmentRepository {
  create(environment: Environment): Promise<Environment>;
  listByProject(projectId: string): Promise<Environment[]>;
  getById(environmentId: string): Promise<Environment | undefined>;
  getByKey(projectId: string, key: string): Promise<Environment | undefined>;
  update(environment: Environment): Promise<Environment>;
  delete(environmentId: string): Promise<void>;
}

export interface FlagRepository {
  create(flag: Flag): Promise<Flag>;
  listByEnvironment(environmentId: string): Promise<Flag[]>;
  getById(flagId: string): Promise<Flag | undefined>;
  getByKey(environmentId: string, key: string): Promise<Flag | undefined>;
  update(flag: Flag): Promise<Flag>;
  delete(flagId: string): Promise<void>;
}

export interface EventRepository {
  ingest(event: FlagEvent): Promise<FlagEvent>;
  list(): Promise<FlagEvent[]>;
}

export interface RepositoryBundle {
  projects: ProjectRepository;
  environments: EnvironmentRepository;
  flags: FlagRepository;
  events: EventRepository;
}
