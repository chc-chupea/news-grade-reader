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

function paragraphFromVision(paragraph: ParagraphItem): PositionedParagraph | null {
  let text = "";
  let confidenceTotal = 0;
  let confidenceCount = 0;
  let uncertain = 0;
  const sizes: number[] = [];
  for (const word of paragraph.words || []) {
    for (const symbol of word.symbols || []) {
      text += symbol.text || "";
      const symbolRect = rectFromVertices(symbol.boundingBox?.vertices);
      sizes.push(Math.sqrt(symbolRect.width * symbolRect.height));
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
  return {
    text,
    ...rect,
    centerX: (rect.left + rect.right) / 2,
    charSize: median(sizes),
    charCount: text.replace(/\s/g, "").length,
    confidence: confidenceCount ? confidenceTotal / confidenceCount : paragraph.confidence || 0,
    uncertain,
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

function extractStage(result: VisionResult) {
  const raw = result.fullTextAnnotation?.text?.trim() || "";
  const blocks = (result.fullTextAnnotation?.pages || []).flatMap((page) => page.blocks || []);
  const nonTextBoxes = blocks
    .filter((block) => block.blockType === "BARCODE" || block.blockType === "PICTURE")
    .map((block) => rectFromVertices(block.boundingBox?.vertices));
  const allParagraphs = blocks
    .filter((block) => !block.blockType || block.blockType === "UNKNOWN" || block.blockType === "TEXT" || block.blockType === "TABLE")
    .flatMap((block) => block.paragraphs || [])
    .map(paragraphFromVision)
    .filter((item): item is PositionedParagraph => Boolean(item));
  if (!allParagraphs.length) return { text: raw, confidence: 0, uncertain: 0, reordered: false, layout: "unknown" };

  const verticalCharacters = allParagraphs.filter((item) => item.height > item.width * 1.25).reduce((sum, item) => sum + item.charCount, 0);
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
  return { text: safeLength ? coordinateText : raw, confidence, uncertain, reordered: safeLength, layout: mostlyVertical ? "vertical" : "horizontal" };
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

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) return Response.json({ error: "VercelにGOOGLE_CLOUD_VISION_API_KEYを登録してください。" }, { status: 503 });
    const { imageDataUrls } = await request.json() as { imageDataUrls?: string[] };
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

    const stages = (data?.responses || []).map(extractStage).filter((item) => item.text);
    const text = mergeParts(stages.map((item) => item.text));
    if (!text) return Response.json({ error: "文字を検出できませんでした。紙面に近づいて、明るい場所で撮ってください。" }, { status: 422 });
    const confidence = stages.length ? stages.reduce((sum, item) => sum + item.confidence, 0) / stages.length : 0;
    const uncertain = stages.reduce((sum, item) => sum + item.uncertain, 0);
    const reordered = stages.filter((item) => item.reordered).length;
    const layout = stages.filter((item) => item.layout === "vertical").length >= Math.ceil(stages.length / 2) ? "vertical" : "horizontal";
    return Response.json({ text, parts: stages.length, confidence: Math.round(confidence * 100), uncertain, reordered, layout });
  } catch (error) {
    console.error("Google Vision OCR failed", error);
    return Response.json({ error: "OCR処理に失敗しました。もう一度お試しください。" }, { status: 500 });
  }
}
