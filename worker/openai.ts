import normalizerPrompt from "../prompts/recipe_normalizer.md";
import recipeSchema from "../schemas/recipe.schema.json";
import type { Env, Recipe } from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

interface NormalizePayload {
  url?: string;
  filename?: string;
  mime?: string;
  data?: string;
}

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

function urlRequest(url: string, env: Env): Record<string, unknown> {
  const input = `${normalizerPrompt}\n\n登録用のURL変換です。web_searchツールで、次のURLそのものを確認してください。\nURL: ${url}\n\nページ内の対象レシピだけを抽出し、別レシピや関連レシピを混ぜないでください。\nページにない人数・分量・手順は推測せず、nullまたはreview_flagsに記録してください。`;
  return {
    model: env.OPENAI_MODEL,
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
    text: { format: { type: "json_schema", name: "auto_recipe", strict: true, schema: recipeSchema } },
  };
}

function fileRequest(payload: NormalizePayload, env: Env): Record<string, unknown> {
  const filename = payload.filename?.trim() || "recipe";
  const mime = payload.mime?.trim() || "application/octet-stream";
  const data = payload.data ?? "";
  const estimatedBytes = Math.floor(data.length * 0.75);
  if (!data) throw new Error("ファイルの内容がありません");
  if (estimatedBytes > MAX_FILE_BYTES) throw new Error("ファイルは15MB以下にしてください");
  return {
    model: env.OPENAI_MODEL,
    input: [{
      role: "user",
      content: [
        { type: "input_file", filename, file_data: `data:${mime};base64,${data}` },
        { type: "input_text", text: normalizerPrompt },
      ],
    }],
    text: { format: { type: "json_schema", name: "auto_recipe", strict: true, schema: recipeSchema } },
  };
}

export function buildOpenAIRequest(payload: NormalizePayload, env: Env): Record<string, unknown> {
  if (payload.url) {
    let url: URL;
    try {
      url = new URL(payload.url);
    } catch {
      throw new Error("有効なURLを入力してください");
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("httpまたはhttpsのURLを入力してください");
    return urlRequest(url.toString(), env);
  }
  if (payload.data) return fileRequest(payload, env);
  throw new Error("URLまたはファイルを指定してください");
}

export function responseText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("");
}

export async function normalizeRecipe(payload: NormalizePayload, env: Env): Promise<Recipe> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEYが設定されていません");
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAIRequest(payload, env)),
  });
  const result = await response.json<OpenAIResponse & { error?: { message?: string } }>();
  if (!response.ok) throw new Error(result.error?.message || `OpenAI API error ${response.status}`);
  const text = responseText(result);
  if (!text) throw new Error("OpenAI APIからレシピJSONを取得できませんでした");
  return JSON.parse(text) as Recipe;
}
