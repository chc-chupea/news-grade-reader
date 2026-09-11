import { askOpenAI } from "@/lib/openai";

export const maxDuration = 60;

type Vertex = { x?: number; y?: number };
type SymbolItem = {
  text?: string;
  confidence?: number;
  boundingBox?: { vertices?: Vertex[] };
  property?: { detectedBreak?: { type?: string } };
};
type WordItem = { symbols?: SymbolItem[] };
type ParagraphItem = {
  confidence?: number;
  boundingBox?: { vertices?: Vertex[] };
  words?: WordItem[];
};
type BlockItem = {
  blockType?: "UNKNOWN" | "TEXT" | "TABLE" | "PICTURE" | "RULER" | "BARCODE";
  boundingBox?: { vertices?: Vertex[] };
  paragraphs?: ParagraphItem[];
};
type VisionPage = { blocks?: BlockItem[] };
type VisionResult = {
  fullTextAnnotation?: { text?: string; pages?: VisionPage[] };
  error?: { code?: number; message?: string };
};
type VisionResponse = {
  responses?: VisionResult[];
  error?: { code?: number; message?: string; status?: string };
};

type PositionedParagraph = {
  id: string;
  stage: number;
  text: string;
  left: number;
  right: number;
  centerX: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  charSize: number;
  charCount: number;
  confidence: number;
  uncertain: number;
  direction: "vertical" | "horizontal";
};

type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

function stripDataPrefix(dataUrl: string) {
  return dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function rectFromVertices(vertices: Vertex[] = []): Rect {
  if (!vertices.length) return { left: 0, right: 1, top: 0, bottom: 1, width: 1, height: 1 };
  const xs = vertices.map((item) => item.x || 0), ys = vertices.map((item) => item.y || 0);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, right, top, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function paragraphFromVision(paragraph: ParagraphItem, id: string, stage: number, preferVertical = false): PositionedParagraph | null {
  let text = "";
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let uncertain = 0;
  const sizes: number[] = [];
  const symbols: Array<{ text: string; centerX: number; centerY: number; width: number; height: number }> = [];
  for (const word of paragraph.words || []) {
    for (const symbol of word.symbols || []) {
      text += symbol.text || "";
      const symbolRect = rectFromVertices(symbol.boundingBox?.vertices);
      sizes.push(Math.sqrt(symbolRect.width * symbolRect.height));
      symbols.push({ text: symbol.text || "", centerX: (symbolRect.left + symbolRect.right) / 2, centerY: (symbolRect.top + symbolRect.bottom) / 2, width: symbolRect.width, height: symbolRect.height });
      if (typeof symbol.confidence === "number") {
        confidenceTotal += symbol.confidence;
        confidenceCount++;
        if (symbol.confidence < .72) uncertain++;
      }
      const breakType = symbol.property?.detectedBreak?.type;
      if (breakType === "SPACE" || breakType === "SURE_SPACE") text += " ";
    }
  }
  text = text.trim();
  if (!text) return null;
  const rect = rectFromVertices(paragraph.boundingBox?.vertices);
  let verticalTravel = 0, horizontalTravel = 0;
  const typicalSize = median(sizes) || 1;
  for (let index = 1; index < symbols.length; index++) {
    const dx = Math.abs(symbols[index].centerX - symbols[index - 1].centerX), dy = Math.abs(symbols[index].centerY - symbols[index - 1].centerY);
    if (Math.hypot(dx, dy) <= typicalSize * 4) { verticalTravel += dy; horizontalTravel += dx; }
  }
  const isVertical = rect.height > rect.width * 1.15
    || verticalTravel > horizontalTravel * 1.35
    || preferVertical && rect.height > rect.width * .75 && verticalTravel > horizontalTravel * .8;
  if (isVertical && symbols.length > 1) {
    const tolerance = Math.max(3, median(symbols.map((item) => item.width)) * .72);
    const columns: Array<{ centerX: number; items: typeof symbols }> = [];
    for (const symbol of [...symbols].sort((a, b) => b.centerX - a.centerX)) {
      let column = columns.reduce<typeof columns[number] | null>((closest, candidate) => {
        if (Math.abs(candidate.centerX - symbol.centerX) > tolerance) return closest;
        return !closest || Math.abs(candidate.centerX - symbol.centerX) < Math.abs(closest.centerX - symbol.centerX) ? candidate : closest;
      }, null);
      if (!column) { column = { centerX: symbol.centerX, items: [] }; columns.push(column); }
      column.items.push(symbol);
      column.centerX = column.items.reduce((sum, item) => sum + item.centerX, 0) / column.items.length;
    }
    columns.sort((a, b) => b.centerX - a.centerX);
    text = columns.map((column) => column.items.sort((a, b) => a.centerY - b.centerY).map((item) => item.text).join("")).join("");
  }
  return {
    id,
    stage,
    text,
    ...rect,
    centerX: (rect.left + rect.right) / 2,
    charSize: median(sizes),
    charCount: text.replace(/\s/g, "").length,
    confidence: confidenceCount ? confidenceTotal / confidenceCount : paragraph.confidence || 0,
    uncertain,
    direction: isVertical ? "vertical" : "horizontal",
  };
}

function isNearNonText(item: PositionedParagraph, boxes: Rect[]) {
  if (item.height > item.width * 1.25 || item.charCount > 90) return false;
  const centerY = (item.top + item.bottom) / 2;
  return boxes.some((box) => {
    const marginX = Math.max(28, box.width * .65), marginY = Math.max(24, box.height * .45);
    return item.centerX >= box.left - marginX && item.centerX <= box.right + marginX
      && centerY >= box.top - marginY && centerY <= box.bottom + marginY;
  });
}

function orderVertical(items: PositionedParagraph[]) {
  const bodySize = median(items.map((item) => item.charSize).filter(Boolean));
  const headings = items.filter((item) => bodySize && item.charSize >= bodySize * 1.45 && item.charCount <= 100);
  const body = items.filter((item) => !headings.includes(item));
  const sorter = (a: PositionedParagraph, b: PositionedParagraph) => {
    const tolerance = Math.max(8, Math.min(a.width, b.width) * .7);
    return Math.abs(a.centerX - b.centerX) <= tolerance ? a.top - b.top : b.centerX - a.centerX;
  };
  return [...headings.sort(sorter), ...body.sort(sorter)];
}

function extractStage(result: VisionResult, stage: number, layoutHint: "vertical" | "auto" = "auto") {
  const raw = result.fullTextAnnotation?.text?.trim() || "";
  const blocks = (result.fullTextAnnotation?.pages || []).flatMap((page) => page.blocks || []);
  const nonTextBoxes = blocks
    .filter((block) => block.blockType === "BARCODE" || block.blockType === "PICTURE")
    .map((block) => rectFromVertices(block.boundingBox?.vertices));
  const allParagraphs = blocks
    .flatMap((block, blockIndex) => (!block.blockType || block.blockType === "UNKNOWN" || block.blockType === "TEXT" || block.blockType === "TABLE")
      ? (block.paragraphs || []).map((paragraph, paragraphIndex) => paragraphFromVision(paragraph, `s${stage}-b${blockIndex}-p${paragraphIndex}`, stage, layoutHint === "vertical"))
      : [])
    .filter((item): item is PositionedParagraph => Boolean(item));
  if (!allParagraphs.length) return { text: raw, confidence: 0, uncertain: 0, reordered: false, layout: "unknown", regions: [] as PositionedParagraph[] };

  const verticalCharacters = allParagraphs.filter((item) => item.direction === "vertical").reduce((sum, item) => sum + item.charCount, 0);
  const totalCharacters = allParagraphs.reduce((sum, item) => sum + item.charCount, 0);
  const mostlyVertical = verticalCharacters >= totalCharacters * .55;
  const paragraphs = allParagraphs.filter((item) => !isNearNonText(item, nonTextBoxes));
  const ordered = mostlyVertical ? orderVertical(paragraphs) : [...paragraphs];
  if (!mostlyVertical) {
    ordered.sort((a, b) => Math.abs(a.top - b.top) <= Math.max(a.height, b.height) * .5 ? a.centerX - b.centerX : a.top - b.top);
  }

  const coordinateText = ordered.map((item) => item.text).join("\n");
  const rawLength = raw.replace(/\s/g, "").length;
  const coordinateLength = coordinateText.replace(/\s/g, "").length;
  const safeLength = !rawLength || coordinateLength / rawLength >= .82 && coordinateLength / rawLength <= 1.18;
  const confidence = paragraphs.reduce((sum, item) => sum + item.confidence, 0) / paragraphs.length;
  const uncertain = paragraphs.reduce((sum, item) => sum + item.uncertain, 0);
  return { text: safeLength ? coordinateText : raw, confidence, uncertain, reordered: safeLength, layout: mostlyVertical ? "vertical" : "horizontal", regions: paragraphs };
}

const transcriptionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    excludedElements: { type: "array", items: { type: "string" } },
    uncertainSegments: { type: "array", items: { type: "string" } },
    layout: { type: "string", enum: ["vertical", "horizontal", "mixed"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    complete: { type: "boolean" },
  },
  required: ["headline", "body", "excludedElements", "uncertainSegments", "layout", "confidence", "complete"],
};

type TranscriptionResult = {
  headline: string; body: string; excludedElements: string[]; uncertainSegments: string[];
  layout: "vertical" | "horizontal" | "mixed"; confidence: "high" | "medium" | "low"; complete: boolean;
};

async function transcribeNewspaper(regions: PositionedParagraph[], imageUrl: string, options: { previousText: string; partIndex: number; partCount: number; layoutHint: "vertical" | "auto" }) {
  if (!regions.length || !process.env.OPENAI_API_KEY) return null;
  const candidates = regions.map((item) => ({
    id: item.id, stage: item.stage + 1, text: item.text,
    x: Math.round(item.left), y: Math.round(item.top), width: Math.round(item.width), height: Math.round(item.height),
    characterSize: Math.round(item.charSize * 10) / 10,
    direction: item.direction,
  }));
  try {
    return await askOpenAI([{
      role: "user",
      content: [
        { type: "input_image", image_url: imageUrl, detail: "high" },
        {
        type: "input_text",
        text: `あなたは日本の新聞紙面を正確に読む専門家です。画像そのものを主資料、Google OCR文字ブロックを位置確認用の下書きとして、一つの記事を原文どおりに読み起こしてください。

必ず行う処理：
1. 大見出し、肩見出しと本文を区別する。
2. この画像が縦書き、横書き、混在のどれかを判定する。
3. 縦書きは右列から左列、各列は上から下へ読む。横書きは上から下、各行は左から右へ読む。
4. 全体が上下に分割された記事では、前の画像から本文が続くことを考慮する。
5. 隣の記事、写真説明、QRコード案内、広告、欄外、ページ誘導を本文から除外する。
6. 前後の意味を使って列と文章のつながりを確認する。ただし画像にない語句を創作しない。

原文保護の規則：
- 要約、言い換え、現代語化、説明の追加をしない。句読点、数字、固有名詞、表記を可能な限り画像どおりにする。
- OCRと画像が違う場合は画像を優先する。
- 画像で判別できない一文字は推測せず「□」にし、uncertainSegmentsにも周辺語とともに入れる。
- headlineには、この画像内で確認できる見出しだけを入れる。見出しがない続きの画像では空文字にする。
- bodyには、この画像に写る本文だけを実際の読む順に入れる。previousTextを繰り返して含めない。
- completeは、画像内の対象本文を末尾まで確認した場合だけtrueにする。

現在は全${options.partCount}分割中の${options.partIndex + 1}番目です。
利用者の指定：${options.layoutHint === "vertical" ? "縦書き記事として確認" : "画像から書字方向を判定"}
前の画像で確定した本文末尾（接続確認専用。出力へ複写しない）：
${options.previousText || "なし"}

OCRブロック：
${JSON.stringify(candidates)}`,
      }],
    }], transcriptionSchema) as TranscriptionResult;
  } catch (error) {
    console.warn("AI newspaper transcription fallback", error);
    return null;
  }
}

function mergeParts(parts: string[]) {
  return parts.reduce((merged, part) => {
    const nextLines = part.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!merged) return nextLines.join("\n");
    const currentLines = merged.split("\n");
    let overlap = 0;
    const limit = Math.min(10, currentLines.length, nextLines.length);
    for (let size = limit; size >= 1; size--) {
      if (currentLines.slice(-size).join("") === nextLines.slice(0, size).join("")) {
        overlap = size;
        break;
      }
    }
    return [...currentLines, ...nextLines.slice(overlap)].join("\n");
  }, "");
}

function chooseBestPass<T extends { text: string; confidence: number; uncertain: number; regions: PositionedParagraph[] }>(primary: T, enhanced: T) {
  const primaryLength = primary.text.replace(/\s/g, "").length, enhancedLength = enhanced.text.replace(/\s/g, "").length;
  const primaryUncertain = primary.uncertain / Math.max(1, primaryLength), enhancedUncertain = enhanced.uncertain / Math.max(1, enhancedLength);
  const enhancedFindsMore = enhancedLength > primaryLength * 1.035 && enhanced.confidence >= primary.confidence - .04;
  const primaryFindsMore = primaryLength > enhancedLength * 1.035 && primary.confidence >= enhanced.confidence - .04;
  const selected = enhancedFindsMore ? enhanced : primaryFindsMore ? primary
    : enhanced.confidence - enhancedUncertain > primary.confidence - primaryUncertain ? enhanced : primary;
  selected.regions.forEach((region) => { region.stage = 0; });
  return selected;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) return Response.json({ error: "VercelにGOOGLE_CLOUD_VISION_API_KEYを登録してください。" }, { status: 503 });
    const { imageDataUrls, dualPass, layoutHint, previousText = "", partIndex = 0, partCount = 1 } = await request.json() as { imageDataUrls?: string[]; dualPass?: boolean; layoutHint?: "vertical" | "auto"; previousText?: string; partIndex?: number; partCount?: number };
    if (!imageDataUrls?.length || imageDataUrls.length > 4 || imageDataUrls.some((image) => !image.startsWith("data:image/"))) {
      return Response.json({ error: "画像を確認できませんでした。もう一度選び直してください。" }, { status: 400 });
    }
    if (imageDataUrls.reduce((sum, image) => sum + image.length, 0) > 4_000_000) {
      return Response.json({ error: "記事の範囲を少し小さくして、もう一度お試しください。" }, { status: 413 });
    }

    const visionResponse = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: imageDataUrls.map((image) => ({
        image: { content: stripDataPrefix(image) },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["ja"] },
      })) }),
    });
    const data = await visionResponse.json().catch(() => null) as VisionResponse | null;
    if (!visionResponse.ok || data?.error) {
      console.error("Google Vision request failed", { status: visionResponse.status, error: data?.error });
      const message = visionResponse.status === 400 ? "Google OCRの設定または画像を確認してください。"
        : visionResponse.status === 403 ? "Google Cloud Vision APIが有効か、APIキーの制限を確認してください。"
        : visionResponse.status === 429 ? "Google OCRの利用上限に達しました。少し待ってからお試しください。"
        : "Google OCRとの通信に失敗しました。";
      return Response.json({ error: message }, { status: visionResponse.status || 502 });
    }
    const failedPart = data?.responses?.find((item) => item.error);
    if (failedPart?.error) {
      console.error("Google Vision part failed", failedPart.error);
      return Response.json({ error: "一部の段を読み取れませんでした。もう一度お試しください。" }, { status: 502 });
    }

    const extracted = (data?.responses || []).map((item, index) => extractStage(item, index, layoutHint === "vertical" ? "vertical" : "auto")).filter((item) => item.text);
    const dualPassUsed = Boolean(dualPass && extracted.length === 2);
    const stages = dualPassUsed ? [chooseBestPass(extracted[0], extracted[1])] : extracted;
    const fallbackText = mergeParts(stages.map((item) => item.text));
    const regions = stages.flatMap((item) => item.regions);
    const transcription = await transcribeNewspaper(regions, imageDataUrls[0], { previousText: previousText.slice(-900), partIndex: Math.max(0, partIndex), partCount: Math.max(1, partCount), layoutHint: layoutHint === "vertical" ? "vertical" : "auto" });
    const transcribedText = transcription ? [transcription.headline.trim(), transcription.body.trim()].filter(Boolean).join("\n") : "";
    const fallbackLength = fallbackText.replace(/\s/g, "").length;
    const transcribedLength = transcribedText.replace(/\s/g, "").length;
    const organizedByAI = Boolean(transcription && transcription.complete && transcribedLength >= fallbackLength * .6 && transcribedLength <= fallbackLength * 1.3);
    const text = organizedByAI ? transcribedText : fallbackText;
    if (!text) return Response.json({ error: "文字を検出できませんでした。紙面に近づいて、明るい場所で撮ってください。" }, { status: 422 });
    const confidence = stages.length ? stages.reduce((sum, item) => sum + item.confidence, 0) / stages.length : 0;
    const uncertain = stages.reduce((sum, item) => sum + item.uncertain, 0);
    const reordered = stages.filter((item) => item.reordered).length;
    const fallbackLayout = stages.filter((item) => item.layout === "vertical").length >= Math.ceil(stages.length / 2) ? "vertical" : "horizontal";
    const layout = organizedByAI ? transcription!.layout : fallbackLayout;
    return Response.json({ text, parts: stages.length, confidence: Math.round(confidence * 100), uncertain, reordered, layout, organizedByAI, correctedCount: 0, dualPassUsed, uncertainSegments: organizedByAI ? transcription!.uncertainSegments : [] });
  } catch (error) {
    console.error("Google Vision OCR failed", error);
    return Response.json({ error: "OCR処理に失敗しました。もう一度お試しください。" }, { status: 500 });
  }
}
