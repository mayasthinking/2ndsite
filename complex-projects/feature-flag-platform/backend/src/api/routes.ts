import { Router } from "express";
import {
  environmentCreateSchema,
  environmentUpdateSchema,
  evaluateFlagSchema,
  flagCreateSchema,
  flagUpdateSchema,
  ingestEventSchema,
  projectCreateSchema,
  projectUpdateSchema
} from "./schemas";
import { asyncHandler, validateBody } from "./http";
import { PlatformService } from "../services/platformService";
import { AppError } from "../domain/errors";

const getParamValue = (
  value: string | string[] | undefined,
  name: string
): string => {
  if (typeof value !== "string") {
    throw new AppError(`Invalid path parameter '${name}'`, 400);
  }
  return value;
};

export const createApiRouter = (service: PlatformService): Router => {
  const router = Router();

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString()
      });
    })
  );

  router.post(
    "/projects",
    asyncHandler(async (req, res) => {
      const body = validateBody(projectCreateSchema, req.body);
      const project = await service.createProject(body);
      res.status(201).json(project);
    })
  );

  router.get(
    "/projects",
    asyncHandler(async (_req, res) => {
      const projects = await service.listProjects();
      res.json(projects);
    })
  );

  router.get(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const project = await service.getProject(
        getParamValue(req.params.projectId, "projectId")
      );
      res.json(project);
    })
  );

  router.put(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const body = validateBody(projectUpdateSchema, req.body);
      const project = await service.updateProject(
        getParamValue(req.params.projectId, "projectId"),
        body
      );
      res.json(project);
    })
  );

  router.delete(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      await service.deleteProject(getParamValue(req.params.projectId, "projectId"));
      res.status(204).send();
    })
  );

  router.post(
    "/projects/:projectId/environments",
    asyncHandler(async (req, res) => {
      const body = validateBody(environmentCreateSchema, req.body);
      const environment = await service.createEnvironment(
        getParamValue(req.params.projectId, "projectId"),
        body
      );
      res.status(201).json(environment);
    })
  );

  router.get(
    "/projects/:projectId/environments",
    asyncHandler(async (req, res) => {
      const environments = await service.listEnvironments(
        getParamValue(req.params.projectId, "projectId")
      );
      res.json(environments);
    })
  );

  router.get(
    "/projects/:projectId/environments/:environmentId",
    asyncHandler(async (req, res) => {
      const environment = await service.getEnvironment(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId")
      );
      res.json(environment);
    })
  );

  router.put(
    "/projects/:projectId/environments/:environmentId",
    asyncHandler(async (req, res) => {
      const body = validateBody(environmentUpdateSchema, req.body);
      const environment = await service.updateEnvironment(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        body
      );
      res.json(environment);
    })
  );

  router.delete(
    "/projects/:projectId/environments/:environmentId",
    asyncHandler(async (req, res) => {
      await service.deleteEnvironment(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId")
      );
      res.status(204).send();
    })
  );

  router.post(
    "/projects/:projectId/environments/:environmentId/flags",
    asyncHandler(async (req, res) => {
      const body = validateBody(flagCreateSchema, req.body);
      const flag = await service.createFlag(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        body
      );
      res.status(201).json(flag);
    })
  );

  router.get(
    "/projects/:projectId/environments/:environmentId/flags",
    asyncHandler(async (req, res) => {
      const flags = await service.listFlags(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId")
      );
      res.json(flags);
    })
  );

  router.get(
    "/projects/:projectId/environments/:environmentId/flags/:flagId",
    asyncHandler(async (req, res) => {
      const flag = await service.getFlag(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        getParamValue(req.params.flagId, "flagId")
      );
      res.json(flag);
    })
  );

  router.put(
    "/projects/:projectId/environments/:environmentId/flags/:flagId",
    asyncHandler(async (req, res) => {
      const body = validateBody(flagUpdateSchema, req.body);
      const flag = await service.updateFlag(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        getParamValue(req.params.flagId, "flagId"),
        body
      );
      res.json(flag);
    })
  );

  router.delete(
    "/projects/:projectId/environments/:environmentId/flags/:flagId",
    asyncHandler(async (req, res) => {
      await service.deleteFlag(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        getParamValue(req.params.flagId, "flagId")
      );
      res.status(204).send();
    })
  );

  router.post(
    "/projects/:projectId/environments/:environmentId/flags/:flagKey/evaluate",
    asyncHandler(async (req, res) => {
      const body = validateBody(evaluateFlagSchema, req.body);
      const result = await service.evaluateByFlagKey(
        getParamValue(req.params.projectId, "projectId"),
        getParamValue(req.params.environmentId, "environmentId"),
        getParamValue(req.params.flagKey, "flagKey"),
        body.context
      );
      res.json(result);
    })
  );

  router.post(
    "/events",
    asyncHandler(async (req, res) => {
      const body = validateBody(ingestEventSchema, req.body);
      const event = await service.ingestEvent(body);
      res.status(202).json(event);
    })
  );

  return router;
};
