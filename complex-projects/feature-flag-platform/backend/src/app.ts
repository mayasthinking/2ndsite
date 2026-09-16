import express, { Express } from "express";
import { createApiRouter } from "./api/routes";
import { errorHandler, notFoundHandler } from "./api/http";
import { createInMemoryRepositories } from "./repositories/inMemoryRepositories";
import { RepositoryBundle } from "./repositories/interfaces";
import { PlatformService } from "./services/platformService";

export interface AppDependencies {
  repositories?: RepositoryBundle;
}

export const createApp = (dependencies: AppDependencies = {}): Express => {
  const repositories = dependencies.repositories ?? createInMemoryRepositories();
  const service = new PlatformService(repositories);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(createApiRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
