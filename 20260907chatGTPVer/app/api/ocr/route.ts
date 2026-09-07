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
    const body = await request.json() as { imageDataUrl?: string; imageDataUrls?: string[] };
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    if (images.length < 1 || images.length > 3 || images.some((image) => !image.startsWith("data:image/")) || images.reduce((sum, image) => sum + image.length, 0) > 8_000_000) {
      return Response.json({ error: "画像が大きすぎるか、画像形式が正しくありません。" }, { status: 400 });
    }

    const imageParts = images.map((image_url) => ({ type: "input_image", image_url, detail: "original" }));
    const draft = await askOpenAI([{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `画像は、赤枠から切り出された日本語の縦書き新聞記事です。
複数画像の場合は同じ記事の段で、上の段から下の段の順に並んでいます。画像1をすべて読んでから画像2へ進んでください。
各画像の中では、右上から下へ読み、次に左の列へ移ってください。
見出し、本文、写真説明を区別してください。
人名・地名・日時・金額・人数・割合は特に慎重に読み取ってください。
「検討」「決定」「予定」「開始」など、事実の強さを変える言葉にも注意してください。
読めない文字は推測せず「□」にしてください。
段落は改行で残し、紙面にない内容は絶対に追加しないでください。
reviewには、確認が必要な箇所を短く列挙してください。なければ空配列です。`,
        },
        ...imageParts,
      ],
    }], schema);
    const verified = await askOpenAI([{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `次のOCR下書きを、元画像と独立して照合してください。
誤字、列や段の読み順、見出し・本文・写真説明の混同を直してください。
人名・地名・日時・金額・人数・割合、および「検討／決定」など意味を変える語を一文字ずつ重点確認してください。
画像で確認できない文字は推測せず「□」にし、その箇所をreviewへ入れてください。
画像にない説明や要約は加えず、新聞の本文をそのまま転記してください。

OCR下書き:
${JSON.stringify(draft)}`,
        },
        ...imageParts,
      ],
    }], schema);
    return Response.json(verified);
  } catch (error) {
    return errorResponse(error);
  }
}
