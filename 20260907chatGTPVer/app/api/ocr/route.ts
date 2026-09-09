type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { code?: number; message?: string };
  }>;
  error?: { code?: number; message?: string; status?: string };
};

function stripDataPrefix(dataUrl: string) {
  return dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
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
      body: JSON.stringify({
        requests: imageDataUrls.map((image) => ({
          image: { content: stripDataPrefix(image) },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["ja"] },
        })),
      }),
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
    const parts = (data?.responses || []).map((item) => item.fullTextAnnotation?.text?.trim() || "").filter(Boolean);
    const text = mergeParts(parts);
    if (!text) return Response.json({ error: "文字を検出できませんでした。紙面に近づいて、明るい場所で撮ってください。" }, { status: 422 });
    return Response.json({ text, parts: parts.length });
  } catch (error) {
    console.error("Google Vision OCR failed", error);
    return Response.json({ error: "OCR処理に失敗しました。もう一度お試しください。" }, { status: 500 });
  }
}
