import { createAssessmentHandler } from "./_lib/assessmentHttp.js";
import { getAssessmentRuntimeService } from "./_lib/assessmentRuntime.js";

export default async function handler(request, response) {
  return createAssessmentHandler(getAssessmentRuntimeService())(
    request,
    response
  );
}
