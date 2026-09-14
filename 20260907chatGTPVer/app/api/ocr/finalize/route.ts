import { askOpenAI, errorResponse } from "@/lib/openai";

export const maxDuration = 60;

type OCRRegion = {
  id: string; part: number; text: string; x: number; y: number; width: number; height: number;
  characterSize: number; direction: "vertical" | "horizontal"; confidence: number; uncertainCharacters: number;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    articleSummary: { type: "string" },
    uncertainSegments: { type: "array", items: { type: "string" } },
    excludedElements: { type: "array", items: { type: "string" } },
    layout: { type: "string", enum: ["vertical", "horizontal", "mixed"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["headline", "body", "articleSummary", "uncertainSegments", "excludedElements", "layout", "confidence"],
};

export async function POST(request: Request) {
  try {
    const { imageDataUrl, ocrRegions, ocrParts, stageCount = 1 } = await request.json() as {
      imageDataUrl?: string; ocrRegions?: OCRRegion[]; ocrParts?: string[]; stageCount?: number;
    };
    if (!imageDataUrl?.startsWith("data:image/") || imageDataUrl.length > 3_500_000) {
      return Response.json({ error: "記事全体の画像を確認できませんでした。" }, { status: 400 });
    }
    if (!Array.isArray(ocrParts) || !ocrParts.length || !Array.isArray(ocrRegions)) {
      return Response.json({ error: "Google OCRの読み取り結果を確認できませんでした。" }, { status: 400 });
    }

    const compactRegions = ocrRegions.slice(0, 350).map((item) => ({
      id: item.id, part: item.part, text: item.text.slice(0, 500), x: item.x, y: item.y,
      width: item.width, height: item.height, characterSize: item.characterSize,
      direction: item.direction, confidence: item.confidence, uncertainCharacters: item.uncertainCharacters,
    }));

    const result = await askOpenAI([{
      role: "user",
      content: [
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
        { type: "input_text", text: `あなたは日本の新聞紙面を正確に読み、記事全体の構造と意味を理解する専門家です。
画像は、利用者が読みたい記事の周囲を囲んだ全体画像です。白く消された部分は対象外です。画像そのものを主資料とし、Google OCRの文字と位置情報は読み取り候補として使ってください。

必ず行う処理：
1. 大見出し、肩見出し、小見出しと本文を区別する。
2. 縦書き・横書き・混在を判断する。
3. 縦書きは右列から左列、各列は上から下へ読む。横書きは左から右、上から下へ読む。
4. 紙面が上下${Math.max(1, Math.min(4, stageCount))}段に分かれる可能性を考慮し、本文の意味と文法から続きを判断する。
5. 隣の記事、写真説明、広告、QRコード案内、欄外、ページ番号を本文から除外する。
6. 人物、出来事、時系列、因果関係を理解し、段や列の接続が自然か記事全体で再確認する。

原文を守る規則：
- headlineとbodyは、要約・言い換え・現代語化をせず、画像で確認できる原文だけを出す。
- OCRと画像が違う場合は画像を優先する。OCRの誤字や列混入をそのまま採用しない。
- 前後の意味は読む順番と誤読候補の確認に使うが、画像にない語句を創作しない。
- 固有名詞、数字、日付、引用、短歌などは特に慎重に画像と照合する。
- 判別できない文字は推測で埋めず「□」とし、uncertainSegmentsに前後を含めて示す。
- articleSummaryだけは、この記事が何を伝えているかを2文以内で説明する。原文にない事実は加えない。
- excludedElementsには、対象記事から除外した要素を簡潔に記す。

Google OCRの段別下書き：
${ocrParts.map((text, index) => `【${index + 1}段目】\n${text.slice(0, 5000)}`).join("\n\n")}

Google OCRの文字ブロックと位置：
${JSON.stringify(compactRegions)}` },
      ],
    }], schema) as {
      headline: string; body: string; articleSummary: string; uncertainSegments: string[];
      excludedElements: string[]; layout: "vertical" | "horizontal" | "mixed"; confidence: "high" | "medium" | "low";
    };

    const text = [result.headline.trim(), result.body.trim()].filter(Boolean).join("\n");
    if (text.replace(/\s/g, "").length < 20) {
      return Response.json({ error: "記事本文を十分に確認できませんでした。" }, { status: 422 });
    }
    return Response.json({
      text,
      summary: result.articleSummary.trim(),
      uncertainSegments: result.uncertainSegments,
      excludedElements: result.excludedElements,
      layout: result.layout,
      confidence: result.confidence,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
