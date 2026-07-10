export const ASSESSMENT_VERSION = 1;
export const ASSESSMENT_DURATION_SECONDS = 20 * 60;
export const DIMENSIONS = Object.freeze(["craft", "systems", "judgment", "delivery"]);

export function defineQuestion(question) {
  if (!question?.id || !DIMENSIONS.includes(question.dimension)) {
    throw new Error(`Invalid assessment question: ${question?.id ?? "unknown"}`);
  }
  if (typeof question.prompt !== "string" || question.prompt.length < 30) {
    throw new Error(`Question prompt is too short: ${question.id}`);
  }
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    throw new Error(`Expected four options: ${question.id}`);
  }
  if (!question.options.some((option) => option.id === question.correctOptionId)) {
    throw new Error(`Correct option is missing: ${question.id}`);
  }

  return Object.freeze({
    ...question,
    options: Object.freeze(
      question.options.map((option) => Object.freeze({ ...option }))
    )
  });
}

export function question(id, dimension, prompt, correct, distractorB, distractorC, distractorD) {
  return defineQuestion({
    id,
    dimension,
    prompt,
    options: [
      { id: "a", label: correct },
      { id: "b", label: distractorB },
      { id: "c", label: distractorC },
      { id: "d", label: distractorD }
    ],
    correctOptionId: "a"
  });
}
