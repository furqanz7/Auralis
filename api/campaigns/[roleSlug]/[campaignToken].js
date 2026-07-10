import { z } from "zod";
import {
  getQueryParam,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { getApplicationRuntimeService } from "../../_lib/applicationRuntime.js";

const campaignQuerySchema = z.object({
  roleSlug: z.string().min(1).max(120),
  campaignToken: z.string().min(16).max(512)
});

export function createCampaignHandler(service) {
  return async function campaignHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const query = campaignQuerySchema.safeParse({
        roleSlug: getQueryParam(request, "roleSlug"),
        campaignToken: getQueryParam(request, "campaignToken")
      });
      if (!query.success) {
        return response.status(404).json({
          error: { code: "CAMPAIGN_UNAVAILABLE" }
        });
      }
      const campaign = await service.validateCampaign(query.data);
      return response.status(200).json({ campaign });
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  return createCampaignHandler(getApplicationRuntimeService())(request, response);
}
