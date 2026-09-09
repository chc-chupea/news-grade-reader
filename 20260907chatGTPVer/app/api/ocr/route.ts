import { askOpenAI, errorResponse } from "@/lib/openai";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { text: { type: "string" }, review: { type: "array", items: { type: "string" } } },
  required: ["text", "review"],
};

export async function POST(request: Request) {
  try {
    const { imageDataUrls } = await request.json() as { imageDataUrls?: string[] };
    if (!imageDataUrls?.length || imageDataUrls.length > 4 || imageDataUrls.some((image) => !image.startsWith("data:image/"))) return Response.json({ error: "画像を確認できませんでした。もう一度選び直してください。" }, { status: 400 });
    if (imageDataUrls.reduce((sum, image) => sum + image.length, 0) > 4_000_000) return Response.json({ error: "記事の範囲を少し小さくして、もう一度お試しください。" }, { status: 413 });
    const result = await askOpenAI([{ role: "user", content: [
      { type: "input_text", text: `これは日本語の新聞記事を切り出した画像です。画像に実際に見える文字だけを、原文のまま転記してください。

画像について：
- 複数画像は、1回撮影した同じ記事を上から順に最大4段へ分割したもの。
- 各画像の上下は少し重複している。重複文は1回だけ転記する。
- 画像1を読み終えてから画像2、画像3、画像4の順につなぐ。

読み方：
- まず大見出し・小見出しを読む。
- 本文が縦書きなら、記事内の右上の列から下へ読み、次の列は左へ進む。
- 本文が複数の段に分かれる場合は、上の段を読み終えてから下の段へ進む。
- 横書きなら左上から読む。
- 写真説明は本文の後に改行して加える。
- 隣の記事、広告、ページ番号は入れない。

絶対ルール：
- 要約、言い換え、説明、補足をしない。
- 人名、地名、国名、数字を文脈から推測しない。
- 見えない文字は作らず「□」にする。
- 読み順に確信がない箇所や「□」をreviewに短く列挙する。
- 画像と無関係な文章は絶対に生成しない。` },
      ...imageDataUrls.map((image_url) => ({ type: "input_image", image_url, detail: "original" })),
    ] }], schema);
    return Response.json(result);
  } catch (error) { return errorResponse(error); }
}
