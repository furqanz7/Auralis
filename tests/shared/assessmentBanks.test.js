import { describe, expect, test } from "vitest";
import { ROLE_CONFIG } from "../../shared/hiring/roles.js";
import {
  getAssessmentDefinition,
  toBrowserAssessment
} from "../../shared/hiring/questions/index.js";

describe.each(ROLE_CONFIG)("$title assessment", ({ slug }) => {
  test("contains 18 valid questions across the approved dimensions", () => {
    const assessment = getAssessmentDefinition(slug);
    expect(assessment.version).toBe(1);
    expect(assessment.durationSeconds).toBe(1200);
    expect(assessment.questions).toHaveLength(18);
    expect(new Set(assessment.questions.map((question) => question.id)).size).toBe(18);
    expect(
      assessment.questions.reduce((counts, question) => {
        counts[question.dimension] = (counts[question.dimension] ?? 0) + 1;
        return counts;
      }, {})
    ).toEqual({ craft: 6, systems: 4, judgment: 4, delivery: 4 });

    for (const question of assessment.questions) {
      expect(question.prompt.length).toBeGreaterThan(30);
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
      expect(
        question.options.some((option) => option.id === question.correctOptionId)
      ).toBe(true);
      expect(question.options.map((option) => option.label.toLowerCase())).not.toContain(
        "all of the above"
      );
      expect(question.options.map((option) => option.label.toLowerCase())).not.toContain(
        "none of the above"
      );
    }
  });

  test("removes correctness from the browser projection", () => {
    const projected = toBrowserAssessment(getAssessmentDefinition(slug));
    expect(projected.questions).toHaveLength(18);
    expect(projected.questions[0]).not.toHaveProperty("correctOptionId");
    expect(projected.questions[0].options[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), label: expect.any(String) })
    );
  });
});

test("returns null for an unknown role assessment", () => {
  expect(getAssessmentDefinition("unknown-role")).toBeNull();
});
