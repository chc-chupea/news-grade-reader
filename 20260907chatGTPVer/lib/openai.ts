const endpoint = "https://api.openai.com/v1/responses";

export async function askOpenAI(input: unknown, schema: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIError("VercelにOPENAI_API_KEYを登録するとAI読み取りを使えます。", 503);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "newspaper_result",
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => null) as {
    error?: { message?: string; code?: string; type?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  } | null;

  if (!response.ok) {
    const message = response.status === 401
      ? "APIキーを確認してください。"
      : response.status === 429 && (data?.error?.code === "insufficient_quota" || data?.error?.type === "insufficient_quota")
        ? "OpenAI APIの残高または利用上限を確認してください。"
        : response.status === 429
          ? "アクセスが集中しています。少し待ってから、もう一度お試しください。"
        : "AIとの通信に失敗しました。少し待ってから、もう一度お試しください。";
    throw new OpenAIError(message, response.status, data?.error?.message);
  }

  const raw = data?.output_text || data?.output
    ?.flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .join("");
  if (!raw) throw new OpenAIError("AIの回答を読み取れませんでした。", 502);

  try {
    return JSON.parse(raw);
  } catch {
    throw new OpenAIError("AIの回答形式が正しくありませんでした。", 502);
  }
}

export class OpenAIError extends Error {
  constructor(message: string, public status = 500, public detail?: string) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof OpenAIError) {
    console.error("OpenAI request failed", { status: error.status, detail: error.detail });
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Unexpected API error", error);
  return Response.json({ error: "処理に失敗しました。もう一度お試しください。" }, { status: 500 });
}
