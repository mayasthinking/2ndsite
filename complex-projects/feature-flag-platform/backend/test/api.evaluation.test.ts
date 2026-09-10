import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("POST /projects/:projectId/environments/:environmentId/flags/:flagKey/evaluate", () => {
  it("evaluates flag based on context rules", async () => {
    const app = createApp();

    const projectResponse = await request(app).post("/projects").send({
      key: "shop",
      name: "Shop"
    });
    expect(projectResponse.status).toBe(201);
    const projectId = projectResponse.body.id as string;

    const environmentResponse = await request(app)
      .post(`/projects/${projectId}/environments`)
      .send({
        key: "prod",
        name: "Production"
      });
    expect(environmentResponse.status).toBe(201);
    const environmentId = environmentResponse.body.id as string;

    const flagResponse = await request(app)
      .post(`/projects/${projectId}/environments/${environmentId}/flags`)
      .send({
        key: "new_checkout",
        name: "New Checkout",
        enabled: true,
        defaultVariant: "control",
        defaultValue: false,
        targetingRules: [
          {
            name: "internal users",
            variant: "treatment",
            value: true,
            condition: {
              op: "match",
              attribute: "user.isInternal",
              comparator: "eq",
              value: true
            }
          }
        ]
      });
    expect(flagResponse.status).toBe(201);

    const evaluationResponse = await request(app)
      .post(
        `/projects/${projectId}/environments/${environmentId}/flags/new_checkout/evaluate`
      )
      .send({
        context: {
          user: {
            isInternal: true
          }
        }
      });

    expect(evaluationResponse.status).toBe(200);
    expect(evaluationResponse.body).toMatchObject({
      flagKey: "new_checkout",
      enabled: true,
      matched: true,
      variant: "treatment",
      value: true
    });
  });
});
