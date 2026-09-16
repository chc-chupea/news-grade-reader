export type OCRRegion = {
  id: string; text: string; x: number; y: number; width: number; height: number;
  direction: "vertical" | "horizontal"; confidence: number | null;
};

// Preserve NDLOCR's nested line order, including repeated text at different positions.
export function extractRegions(raw: unknown): OCRRegion[] {
  const regions: OCRRegion[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.text === "string" && Array.isArray(item.boundingBox)
        && item.isTextline !== false && item.isTextline !== "false") {
      const points = item.boundingBox;
      if (points.length < 2 || !points.every((p) => Array.isArray(p)
          && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)))) return;
      const xs = points.map((p) => p[0] as number), ys = points.map((p) => p[1] as number);
      if (!item.text.trim()) return;
      regions.push({
        id: `line-${regions.length + 1}`, text: item.text,
        x: Math.min(...xs), y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        direction: item.isVertical === true || item.isVertical === "true" ? "vertical" : "horizontal",
        confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : null,
      });
      return;
    }
    Object.values(item).forEach(visit);
  }
  visit(raw);
  return regions;
}

export type ArticlePlan = {
  orderedIds: string[]; excluded: Array<{ id: string; reason: string }>;
  uncertainIds: string[]; summary: string;
  layout: "vertical" | "horizontal" | "mixed"; confidence: "high" | "medium" | "low";
};

// No model-generated replacement text. Every line must be accounted for once.
export function assembleArticle(regions: OCRRegion[], plan: ArticlePlan) {
  const byId = new Map(regions.map((line) => [line.id, line]));
  const ids = [...plan.orderedIds, ...plan.excluded.map((item) => item.id)];
  if (byId.size !== regions.length || !plan.orderedIds.length
      || ids.length !== regions.length || new Set(ids).size !== ids.length
      || ids.some((id) => !byId.has(id)) || plan.uncertainIds.some((id) => !byId.has(id))) {
    throw new Error("Invalid article line selection");
  }
  return {
    text: plan.orderedIds.map((id) => byId.get(id)!.text).join("\n"),
    uncertainSegments: [...new Set(plan.uncertainIds)].map((id) => byId.get(id)!.text),
    excludedElements: plan.excluded.map((item) => `${byId.get(item.id)!.text}（${item.reason}）`),
  };
}

export class OCRError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export async function cloudRunToken(request: Request, audience: string) {
  const provider = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER?.trim();
  const email = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!provider || !/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/.test(provider)
      || !email || !/^[\w-]+@[\w-]+\.iam\.gserviceaccount\.com$/.test(email)) {
    throw new OCRError("OCRの接続設定が不足しています。管理者にお知らせください。", 503);
  }
  // The request header is refreshed by Vercel. Build-time tokens expire.
  const oidc = request.headers.get("x-vercel-oidc-token")
    || (process.env.VERCEL !== "1" ? process.env.VERCEL_OIDC_TOKEN : undefined);
  if (!oidc) throw new OCRError("Vercelの認証を確認できませんでした。管理者にお知らせください。", 503);
  const exchanged = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: `//iam.googleapis.com/${provider}`,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt", subject_token: oidc,
    }),
  });
  const access = await exchanged.json().catch(() => null);
  if (!exchanged.ok || typeof access?.access_token !== "string") {
    console.error("OCR federation failed", { status: exchanged.status });
    throw new OCRError("OCRの認証に失敗しました。管理者にお知らせください。", 503);
  }
  const response = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:generateIdToken`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${access.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ audience, includeEmail: true }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.token !== "string") {
    console.error("OCR identity token failed", { status: response.status });
    throw new OCRError("OCRの呼び出し権限を確認できませんでした。管理者にお知らせください。", 503);
  }
  return result.token as string;
}
