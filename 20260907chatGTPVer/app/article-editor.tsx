"use client";

import { useEffect, useRef, useState } from "react";
import type { OCRRegion } from "@/lib/ndlocr";
import { applyCorrection, type Correction } from "@/lib/correction";

export type ArticleImage = { imageDataUrl: string; width: number; height: number; regions: OCRRegion[] };
type Proposal = Correction & { snapshot: string; original: string };

export default function ArticleEditor({ text, onChange, source, disabled }: {
  text: string; onChange: (text: string) => void; source: ArticleImage | null; disabled: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [crop, setCrop] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const line = source?.regions.find((r) => r.id === selected);
  useEffect(() => { setSelected(""); setZoom(1); setUndo(null); }, [source?.imageDataUrl]);
  useEffect(() => {
    let active = true;
    const pending = controller.current; controller.current = null; pending?.abort();
    setBusy(false); setProposal(null); setMessage(""); setCrop("");
    if (source && line) {
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        const pad = Math.max(8, Math.min(line.width, line.height) * .35);
        const x = Math.max(0, line.x - pad), y = Math.max(0, line.y - pad);
        const width = Math.min(image.naturalWidth, line.x + line.width + pad) - x;
        const height = Math.min(image.naturalHeight, line.y + line.height + pad) - y;
        if (width <= 0 || height <= 0 || width * height > 4_000_000) { setMessage("この範囲の拡大画像を作れませんでした。全体画像と見比べて直接直してください。"); return; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#df3e32"; ctx.lineWidth = 1;
        ctx.strokeRect(line.x - x - 1, line.y - y - 1, line.width + 2, line.height + 2);
        const url = canvas.toDataURL("image/png");
        if (url.length > 1_800_000) { setMessage("この範囲は大きすぎるため、直接直してください。"); return; }
        setCrop(url);
      };
      image.onerror = () => { if (active) setMessage("記事画像を開けませんでした。"); };
      image.src = source.imageDataUrl;
    }
    return () => { active = false; const pending = controller.current; controller.current = null; pending?.abort(); };
  }, [source, line]);

  const selectLine = (id: string) => {
    setSelected(id);
    const r = source?.regions.find((item) => item.id === id);
    if (!r || !textarea.current) return;
    const index = text.indexOf(r.text);
    if (index >= 0) {
      textarea.current.focus({ preventScroll: true });
      textarea.current.setSelectionRange(index, index + r.text.length);
    }
  };
  const review = async () => {
    if (!line || !crop || busy || disabled) return;
    const snapshot = text;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setProposal(null); setMessage("");
    const timer = setTimeout(() => abort.abort(), 55_000);
    try {
      const response = await fetch("/api/ocr/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: crop, originalText: line.text }), signal: abort.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error || "確認できませんでした。もう一度お試しください。");
      if (controller.current !== abort || abort.signal.aborted) return;
      setProposal({ ...data, snapshot, original: line.text });
    } catch (error) {
      if (controller.current === abort) setMessage(abort.signal.aborted ? "確認の待ち時間を超えました。画像と見比べて直接直せます。" : error instanceof Error ? error.message : "確認できませんでした。");
    } finally { clearTimeout(timer); if (controller.current === abort) setBusy(false); }
  };
  const replacement = proposal?.status === "clear" ? applyCorrection(text, proposal.snapshot, proposal.original, proposal.correctedText) : null;
  return <div className="article-editor">
    <div className={source ? "comparison-grid" : ""}>
      {source && <div className="article-reference">
        <div className="reference-toolbar"><b>元の記事</b><label>拡大 <select aria-label="記事画像の拡大率" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}><option value={1}>1倍</option><option value={2}>2倍</option><option value={3}>3倍</option></select></label></div>
        <div className="reference-scroll">
          <svg role="img" aria-label="元の記事。赤い枠は確認する行です" viewBox={`0 0 ${source.width} ${source.height}`} style={{ width: `${zoom * 100}%`, maxWidth: "none", display: "block" }}>
            <image href={source.imageDataUrl} width={source.width} height={source.height}/>
            {source.regions.map((r) => <rect key={r.id} x={r.x} y={r.y} width={r.width} height={r.height}
              fill={r.id === selected ? "rgba(223,62,50,.12)" : "transparent"} stroke={r.id === selected ? "#df3e32" : "transparent"}
              strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }} onClick={() => { if (!disabled) selectLine(r.id); }}><title>{r.text}</title></rect>)}
          </svg>
        </div>
        <small>画像の文字を押すと、その行を確認できます。</small>
      </div>}
      <div className="article-text"><label htmlFor="article-text">見比べて直す文章</label>
        <textarea id="article-text" ref={textarea} disabled={disabled} value={text} onChange={(event) => onChange(event.target.value)}
          placeholder="読み取った新聞記事、またはコピーしたデジタル記事をここに入れます。" maxLength={5000}/>
        <div className="counter">{text.length.toLocaleString()} / 5,000字</div>
      </div>
    </div>
    {source && source.regions.length > 0 && <div className="character-review">
      <label htmlFor="review-line"><b>気になる文字を確認する</b></label>
      <select id="review-line" value={selected} disabled={disabled} onChange={(e) => selectLine(e.target.value)}>
        <option value="">確認する行を選んでください</option>
        {source.regions.map((r) => <option key={r.id} value={r.id}>{(r.confidence !== null && r.confidence < .9) || /[0-9０-９㌗□]/.test(r.text) ? "確認候補：" : ""}{r.text.slice(0, 70)}</option>)}
      </select>
      {line && <div className="review-grid">
        <div className="crop-preview">{crop ? <svg role="img" aria-label="確認する行の拡大画像" viewBox="0 0 300 250"><image href={crop} width="300" height="250" preserveAspectRatio="xMidYMid meet"/></svg> : <p>画像を準備しています…</p>}</div>
        <div><p className="review-original">読み取り：{line.text}</p>
          <button type="button" disabled={busy || disabled || !crop} onClick={review}>{busy ? "画像を確認しています…" : "AIにこの画像を確認してもらう"}</button>
          {proposal && <div className="review-proposal" aria-live="polite">
            <b>{proposal.status === "clear" ? "修正候補" : proposal.status === "same" ? "同じ読み取りでした" : "要確認：画像では判断できません"}</b>
            {proposal.status === "clear" && <p>{proposal.correctedText}</p>}<p>{proposal.reason}</p>
            {proposal.status === "clear" && <><small>画像と合っているか確認してから押してください。</small><button type="button" disabled={disabled || replacement === null} onClick={() => {
              if (replacement === null) return;
              setUndo({ before: text, after: replacement }); onChange(replacement); setProposal(null); setMessage("選んだ候補を反映しました。");
            }}>この候補に直す</button>{replacement === null && <p>文章が編集済みか、同じ文字が複数あります。文章欄で直接直してください。</p>}</>}
          </div>}
          {message && <p role="status">{message}</p>}
          {undo && text === undo.after && <button type="button" disabled={disabled} onClick={() => { onChange(undo.before); setUndo(null); setProposal(null); setMessage("直前の修正を戻しました。"); }}>直前の修正を戻す</button>}
        </div>
      </div>}
    </div>}
  </div>;
}
