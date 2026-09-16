import { cloudRunToken, extractRegions, OCRError } from "@/lib/ndlocr";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 3_800_000) throw new OCRError("記事の範囲を少し小さくしてください。", 413);
    let input;
    try { input = JSON.parse(body); } catch { throw new OCRError("画像の送信形式を確認できませんでした。", 400); }
    const image = input?.imageDataUrls?.[0];
    if (!Array.isArray(input?.imageDataUrls) || input.imageDataUrls.length !== 1 || typeof image !== "string") {
      throw new OCRError("画像をもう一度選び直してください。", 400);
    }
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match) throw new OCRError("JPEGまたはPNGの画像を選んでください。", 400);
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.toString("base64") !== match[2]) throw new OCRError("画像が壊れています。選び直してください。", 400);
    const apiKey = process.env.NDLOCR_API_KEY?.trim();
    let url: URL;
    try { url = new URL(process.env.NDLOCR_API_URL?.trim() || ""); }
    catch { throw new OCRError("OCRの接続先が未設定です。管理者にお知らせください。", 503); }
    if (url.protocol !== "https:" || !url.hostname.endsWith(".run.app") || url.username || url.password || url.port
        || url.pathname !== "/" || url.search || url.hash || !apiKey || apiKey.length < 32) {
      throw new OCRError("OCRの接続設定を確認してください。", 503);
    }
    const token = await cloudRunToken(request, url.origin);
    const response = await fetch(`${url.origin}/ocr`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(175_000),
      headers: { Authorization: `Bearer ${token}`, "X-OCR-Key": apiKey, "Content-Type": match[1] },
      body: bytes,
    });
    if (!response.ok) {
      console.error("NDLOCR request failed", { status: response.status });
      const message = response.status === 429 ? "読み取りが混み合っています。少し待ってからお試しください。"
        : response.status === 401 || response.status === 403 ? "OCRの認証設定を確認してください。"
        : response.status === 413 ? "画像が大きすぎます。記事の範囲を少し小さくしてください。"
        : response.status === 504 ? "読み取りに時間がかかっています。記事の範囲を少し小さくしてお試しください。"
        : "OCRで読み取れませんでした。もう一度お試しください。";
      throw new OCRError(message, [413, 429, 504].includes(response.status) ? response.status : 502);
    }
    const result = await response.json();
    if (typeof result?.text !== "string" || !result.text.trim()) throw new OCRError("文字を検出できませんでした。明るい場所で記事に近づいて撮ってください。", 422);
    const regions = extractRegions(result.raw_ocr);
    return Response.json({ text: result.text, ocrRegions: regions, image: {
      width: result.image?.width, height: result.image?.height,
    }, elapsedSeconds: result.elapsed_seconds, engine: "NDLOCR-Lite" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return Response.json({ error: error instanceof OCRError ? error.message : timeout
      ? "読み取りの待ち時間を超えました。少し待ってから、範囲を小さくしてお試しください。"
      : "OCRとの通信に失敗しました。もう一度お試しください。" }, { status: error instanceof OCRError ? error.status : timeout ? 504 : 502 });
  }
}
