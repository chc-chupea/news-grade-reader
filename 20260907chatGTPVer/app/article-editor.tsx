"use client";

import { useEffect, useRef, useState } from "react";
import type { OCRRegion } from "@/lib/ndlocr";

export type ArticleImage = { imageDataUrl: string; width: number; height: number; regions: OCRRegion[] };

export default function ArticleEditor({ text, onChange, source, disabled }: {
  text: string; onChange: (text: string) => void; source: ArticleImage | null; disabled: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setSelected(""); setZoom(1); setMessage(""); }, [source]);

  const selectLine = (id: string) => {
    if (disabled) return;
    setSelected(id);
    const r = source?.regions.find((item) => item.id === id);
    if (!r || !textarea.current) return;
    const index = text.indexOf(r.text);
    if (index < 0) { setMessage("この行は編集済みか、本文から外れています。画像と見比べて文章欄を確認してください。"); return; }
    if (text.indexOf(r.text, index + 1) >= 0) { setMessage("同じ文章が複数あります。前後を見比べて、直す場所を選んでください。"); return; }
    textarea.current.focus({ preventScroll: true });
    textarea.current.setSelectionRange(index, index + r.text.length);
    setMessage("右の文章で、この行を選びました。画像と見比べて直接直せます。");
  };
  return <div className="article-editor">
    <div className={source ? "comparison-grid" : ""}>
      {source && <div className="article-reference">
        <div className="reference-toolbar"><b>元の記事</b><label>拡大 <select aria-label="記事画像の拡大率" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}><option value={1}>1倍</option><option value={2}>2倍</option><option value={3}>3倍</option></select></label></div>
        <div className="reference-scroll">
          <svg role="group" aria-label="元の記事。文字の行を選ぶと右の文章で確認できます" viewBox={`0 0 ${source.width} ${source.height}`} style={{ width: `${zoom * 100}%`, maxWidth: "none", display: "block" }}>
            <image href={source.imageDataUrl} width={source.width} height={source.height}/>
            {source.regions.map((r) => <rect key={r.id} x={r.x} y={r.y} width={r.width} height={r.height}
              role="button" tabIndex={disabled ? -1 : 0} aria-label={`この行を確認：${r.text}`} aria-disabled={disabled}
              fill={r.id === selected ? "rgba(223,62,50,.12)" : "transparent"} stroke={r.id === selected ? "#df3e32" : "transparent"}
              strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: "pointer" }}
              onClick={() => selectLine(r.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectLine(r.id); } }}><title>{r.text}</title></rect>)}
          </svg>
        </div>
        <small>画像の文字を押すと、右の文章の同じ行を選べます。</small>
      </div>}
      <div className="article-text"><label htmlFor="article-text">見比べて直す文章</label>
        <textarea id="article-text" ref={textarea} disabled={disabled} value={text} onChange={(event) => onChange(event.target.value)}
          placeholder="読み取った新聞記事、またはコピーしたデジタル記事をここに入れます。" maxLength={5000}/>
        <div className="counter">{text.length.toLocaleString()} / 5,000字</div>
      </div>
    </div>
    {source && message && <small role="status">{message}</small>}
  </div>;
}
