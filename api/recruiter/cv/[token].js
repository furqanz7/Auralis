import { z } from "zod";
import { readServerEnv } from "../../_lib/env.js";
import {
  getQueryParam,
  requireMethod,
  sendHttpError,
  setPrivateHeaders
} from "../../_lib/http.js";
import { getApplicationRuntimeService } from "../../_lib/applicationRuntime.js";

const recruiterTokenSchema = z.string().min(16).max(512);

function isAllowedStorageUrl(value, allowedStorageHost) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === allowedStorageHost &&
      url.pathname.startsWith("/storage/v1/object/sign/")
    );
  } catch {
    return false;
  }
}

export function createRecruiterCvHandler(service, { allowedStorageHost }) {
  return async function recruiterCvHandler(request, response) {
    setPrivateHeaders(response);
    try {
      requireMethod(request, response, "GET");
      const token = recruiterTokenSchema.safeParse(getQueryParam(request, "token"));
      if (!token.success) {
        return response.status(404).json({ error: { code: "CV_LINK_INVALID" } });
      }
      const result = await service.getRecruiterCv({ recruiterToken: token.data });
      if (!isAllowedStorageUrl(result.url, allowedStorageHost)) {
        return response.status(502).json({ error: { code: "CV_LINK_INVALID" } });
      }
      return response.redirect(302, result.url);
    } catch (error) {
      return sendHttpError(response, error);
    }
  };
}

export default async function handler(request, response) {
  const env = readServerEnv();
  return createRecruiterCvHandler(getApplicationRuntimeService(), {
    allowedStorageHost: new URL(env.SUPABASE_URL).hostname
  })(request, response);
}
