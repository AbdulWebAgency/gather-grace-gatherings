import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock, createGoogleMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  createGoogleMock: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({ createGoogle: createGoogleMock }));
vi.mock("ai", () => ({
  generateObject: generateObjectMock,
  jsonSchema: (schema: unknown) => schema,
}));

import { GeminiPlanningProvider } from "./geminiProvider.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Gemini request reliability", () => {
  it("uses a single bounded request and validates the structured result", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const extracted = {
      name: "Neighborhood gathering",
      category: "community",
      date: "2026-12-01",
      dateIsApproximate: false,
      location: "Pune",
      guestCount: 80,
      budget: 100_000,
      currency: "INR",
      theme: "Festive",
      priorities: [],
      mustHaves: [],
      accessibilityNeeds: [],
      dietaryCulturalNeeds: [],
      constraints: [],
      missingInformation: [],
      followUpQuestions: [],
      assumptions: [],
    };
    createGoogleMock.mockReturnValue(() => ({}));
    generateObjectMock.mockResolvedValue({ object: extracted });

    await expect(
      new GeminiPlanningProvider().extractEventDetails({
        text: "Plan a gathering",
        today: "2026-10-30",
      }),
    ).resolves.toEqual(extracted);

    const options = generateObjectMock.mock.calls[0]?.[0] as {
      maxRetries: number;
      abortSignal: AbortSignal;
    };
    expect(options.maxRetries).toBe(0);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
