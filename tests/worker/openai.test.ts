import { describe, expect, it } from "vitest";
import { buildOpenAIRequest, responseText } from "../../worker/openai";
import type { Env } from "../../worker/types";

const env = { OPENAI_MODEL: "test-model" } as Env;

describe("OpenAI request", () => {
  it("builds a web-search request for an URL", () => {
    const request = buildOpenAIRequest({ url: "https://example.com/recipe" }, env);
    expect(request.model).toBe("test-model");
    expect(request.tools).toEqual([{ type: "web_search" }]);
  });

  it("rejects non-http URLs", () => {
    expect(() => buildOpenAIRequest({ url: "file:///etc/passwd" }, env)).toThrow("httpまたはhttps");
  });

  it("extracts output text from response items", () => {
    expect(responseText({ output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }] })).toBe('{"ok":true}');
  });
});
