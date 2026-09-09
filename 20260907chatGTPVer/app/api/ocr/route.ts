import { askOpenAI, errorResponse } from "@/lib/openai";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    caption: { type: "string" },
    review: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "body", "caption", "review"],
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { imageDataUrl?: string; readingMode?: "article" };
    const image = body.imageDataUrl;

    if (!image || !image.startsWith("data:image/")) {
      return Response.json(
        { error: "画像を読み込めませんでした。もう一度写真を選んでください。" },
        { status: 400 }
      );
    }

    const prompt = `この画像は、日本語の新聞記事からユーザーが赤枠で選んだ部分です。

この範囲にある1本の記事を、紙面に書かれている通りに読み取ってください。

- 見出しは headline
- 記事本文は body
- 写真や図の説明は caption
- 読みに自信がない文字や確認してほしい箇所は review

縦書き本文は、右の列から左の列へ読んでください。
見出し・本文・写真説明を区別してください。
隣の記事が少し写っていても混ぜないでください。
人名、地名、数字、日時、金額は特に慎重に読んでください。
読めない文字は想像で補わず「□」にしてください。
要約や言い換えはせず、画像に書かれている文章だけを返してください。
確認箇所がなければ review は空配列にしてください。`;

    const result = await askOpenAI([{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: image, detail: "original" },
      ],
    }], schema);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
