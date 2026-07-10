import {
  ASSESSMENT_DURATION_SECONDS,
  ASSESSMENT_VERSION
} from "../assessmentSchema.js";
import { aiProductEngineerQuestions } from "./aiProductEngineer.js";
import { brandSystemsDesignerQuestions } from "./brandSystemsDesigner.js";
import { creativeFrontendDeveloperQuestions } from "./creativeFrontendDeveloper.js";
import { fullStackProductEngineerQuestions } from "./fullStackProductEngineer.js";
import { productDesignerQuestions } from "./productDesigner.js";
import { productStrategyLeadQuestions } from "./productStrategyLead.js";

const BANKS = Object.freeze({
  "senior-ai-product-engineer": aiProductEngineerQuestions,
  "senior-creative-frontend-developer": creativeFrontendDeveloperQuestions,
  "senior-full-stack-product-engineer": fullStackProductEngineerQuestions,
  "senior-product-designer": productDesignerQuestions,
  "senior-brand-visual-systems-designer": brandSystemsDesignerQuestions,
  "senior-product-strategy-delivery-lead": productStrategyLeadQuestions
});

export function getAssessmentDefinition(roleSlug) {
  const questions = BANKS[roleSlug];
  if (!questions) return null;
  return Object.freeze({
    version: ASSESSMENT_VERSION,
    durationSeconds: ASSESSMENT_DURATION_SECONDS,
    questions
  });
}

export function toBrowserAssessment(assessment) {
  return {
    version: assessment.version,
    durationSeconds: assessment.durationSeconds,
    questions: assessment.questions.map(({ correctOptionId: _correctOptionId, ...question }) => ({
      ...question,
      options: question.options.map((option) => ({ ...option }))
    }))
  };
}
