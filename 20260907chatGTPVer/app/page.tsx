"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, ImagePlus, RotateCcw, ScanLine, Sparkles } from "lucide-react";

type Box = { x: number; y: number; w: number; h: number };
type Result = { title: string; body: string; points: string[]; words: [string, string][]; why: string; relation: string; quiz: { question: string; answer: string }[] };
const grades = [
  { id: "小4", label: "小学4年", note: "やさしく短く" }, { id: "小5", label: "小学5年", note: "理由もわかる" },
  { id: "小6", label: "小学6年", note: "原因と結果" }, { id: "中1", label: "中学1年", note: "要点を整理" },
  { id: "中2", label: "中学2年", note: "背景も整理" }, { id: "中3", label: "中学3年", note: "原文に近く" },
];

export default function Home() {
  const [text, setText] = useState(""), [grade, setGrade] = useState("小4");
  const [result, setResult] = useState<Result | null>(null), [converting, setConverting] = useState(false);
  const [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const selectedGrade = grades.find((item) => item.id === grade)!;
  const convert = async () => {
    if (!text.trim() || converting) return;
    setConverting(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim(), grade }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "変換に失敗しました。");
      setResult(data); setTimeout(() => document.querySelector("#result")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "変換に失敗しました。"); }
    finally { setConverting(false); }
  };
  return <main>
    <header className="topbar"><div className="brand"><span>読</span><div>新聞をわかりやすく<small>NEWS READER FOR STUDENTS</small></div></div><div className="version">新聞読解AI <b>Ver.3.8</b></div></header>
    <section className="hero"><p><Sparkles size={16}/>新聞がわかる。社会が近くなる。</p><h1>気になるニュースを<br/>読みやすい<span className="word-highlight">言葉</span>へ</h1><div className="flow"><span><b>1</b>撮る</span><span><b>2</b>囲む</span><span><b>3</b>学年を選ぶ</span></div></section>
    <Scanner onRead={(value) => { setText(value); setResult(null); }}/>
    <section className="workspace">
      <div className="panel"><SectionTitle number="3" title="読み取った文章" note=""/><p className="digital-paste-note">デジタル記事のテキストは、ここにコピー＆ペーストしてください。</p><p className="edit-note">直したいところがある場合は、ここで直せます。</p><textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} placeholder="読み取った新聞記事、またはコピーしたデジタル記事をここに入れます。" maxLength={5000}/><div className="counter">{text.length.toLocaleString()} / 5,000字</div></div>
      <div className="panel"><SectionTitle number="4" title="読む人の学年を選ぶ" note="学年に合う言葉と文の長さに整えます。"/><div className="grades">{grades.map((item) => <button key={item.id} className={grade === item.id ? "grade active" : "grade"} onClick={() => { setGrade(item.id); setResult(null); }}><b>{item.id}</b><span>{item.label}</span><small>{item.note}</small>{grade === item.id && <Check size={15}/>}</button>)}</div><button className="primary" disabled={!text.trim() || converting} onClick={convert}><Sparkles size={19}/>{converting ? "わかりやすくしています…" : selectedGrade.label + "向けにする"}</button>{error && <p className="message error">{error}</p>}<p className="privacy">画像と文章は保存しません。処理のためOpenAI APIへ送信します。</p></div>
    </section>
    {result && <section id="result" className="result"><div className="result-heading"><div><small>{grade}向け</small><h2>{result.title}</h2></div><button onClick={async () => { await navigator.clipboard.writeText(result.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "コピーしました" : "コピー"}</button></div><p className="article">{result.body}</p><div className="result-grid"><section><h3>大事なこと</h3><ol>{result.points.map((point, index) => <li key={index}><b>{index + 1}</b>{point}</li>)}</ol></section><section><h3>ニュースの言葉</h3>{result.words.map(([word, meaning]) => <dl key={word}><dt>{word}</dt><dd>{meaning}</dd></dl>)}</section><section><h3>どうして？</h3><p>{result.why}</p></section><section className="quiz-section"><h3>わかったかな？</h3>{result.quiz.map((item, index) => <QuizItem key={index} number={index + 1} question={item.question} answer={item.answer}/>)}</section></div></section>}
    <footer>新聞記事 AI学年別理解サポート（試作版）</footer>
  </main>;
}

function SectionTitle({ number, title, note }: { number: string; title: string; note: string }) {
  return <div className="section-title"><b>{number}</b><div><h2>{title}</h2><p>{note}</p></div></div>;
}

function QuizItem({ number, question, answer }: { number: number; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <div className="quiz-item">
    <p><b>Q{number}</b>{question}</p>
    <button type="button" onClick={() => setOpen((current) => !current)}>{open ? "答えを隠す" : "答えを見る"}</button>
    {open && <div className="quiz-answer"><b>答え</b><span>{answer}</span></div>}
  </div>;
}

function estimateStraighteningAngle(image: HTMLImageElement) {
  const sample = document.createElement("canvas");
  const scale = Math.min(1, 420 / Math.max(image.naturalWidth, image.naturalHeight));
  sample.width = Math.max(1, Math.round(image.naturalWidth * scale));
  sample.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const darkPoints: Array<[number, number]> = [];
  for (let y = 2; y < sample.height - 2; y += 2) for (let x = 2; x < sample.width - 2; x += 2) {
    const offset = (y * sample.width + x) * 4;
    const brightness = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
    if (brightness < 145) darkPoints.push([x, y]);
  }
  if (darkPoints.length < 150) return 0;
  const diagonal = Math.ceil(Math.hypot(sample.width, sample.height));
  const centerX = sample.width / 2, centerY = sample.height / 2;
  let bestAngle = 0, bestScore = -1;
  for (let angle = -7; angle <= 7; angle += .5) {
    const radians = angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
    const rows = new Uint16Array(diagonal + 2), columns = new Uint16Array(diagonal + 2);
    for (const [x, y] of darkPoints) {
      const dx = x - centerX, dy = y - centerY;
      columns[Math.round(dx * cosine - dy * sine + diagonal / 2)]++;
      rows[Math.round(dx * sine + dy * cosine + diagonal / 2)]++;
    }
    let score = 0;
    for (const count of rows) score += count * count;
    for (const count of columns) score += count * count;
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return Math.abs(bestAngle) < .5 ? 0 : bestAngle;
}

function Scanner({ onRead }: { onRead: (text: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), originalImageRef = useRef<HTMLImageElement | null>(null), startRef = useRef<{ x: number; y: number } | null>(null);
  const draftBoxRef = useRef<Box | null>(null), pointerIdRef = useRef<number | null>(null), gestureRectRef = useRef<DOMRect | null>(null);
  const [fileName, setFileName] = useState(""), [box, setBox] = useState<Box | null>(null);
  const [reading, setReading] = useState(false), [adjusting, setAdjusting] = useState(false), [message, setMessage] = useState("");
  const [stageCount, setStageCount] = useState(1);
  const lockPage = () => document.documentElement.classList.add("crop-locked");
  const unlockPage = () => {
    document.documentElement.classList.remove("crop-locked");
  };
  const draw = (selection = box) => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (!selection) return;
    const x = Math.min(selection.x, selection.x + selection.w), y = Math.min(selection.y, selection.y + selection.h), w = Math.abs(selection.w), h = Math.abs(selection.h);
    context.fillStyle = "rgba(16,30,40,.45)";
    context.fillRect(0, 0, canvas.width, y); context.fillRect(0, y, x, h); context.fillRect(x + w, y, canvas.width - x - w, h); context.fillRect(0, y + h, canvas.width, canvas.height - y - h);
    context.strokeStyle = "#df3e32"; context.lineWidth = Math.max(4, canvas.width / 220); context.setLineDash([14, 8]); context.strokeRect(x, y, w, h); context.setLineDash([]);
  };
  useEffect(() => { draw(); }, [box]);
  useEffect(() => {
    const stopTouchScroll = (event: TouchEvent) => { if (startRef.current) event.preventDefault(); };
    document.addEventListener("touchmove", stopTouchScroll, { passive: false });
    return () => { document.removeEventListener("touchmove", stopTouchScroll); unlockPage(); };
  }, []);
  const showImage = (image: HTMLImageElement, nextMessage: string) => {
    imageRef.current = image;
    const canvas = canvasRef.current;
    if (!canvas) { setMessage("画像表示欄を準備できませんでした。もう一度選んでください。"); return; }
    const scale = Math.min(1, 1100 / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    setBox(null);
    setMessage(nextMessage);
    requestAnimationFrame(() => draw(null));
  };
  const rotateImage = (degrees: number, nextMessage: string) => {
    const image = imageRef.current;
    if (!image || adjusting) return;
    setAdjusting(true);
    requestAnimationFrame(() => {
      const radians = degrees * Math.PI / 180;
      const sourceScale = Math.min(1, 2800 / Math.max(image.naturalWidth, image.naturalHeight));
      const sourceWidth = image.naturalWidth * sourceScale, sourceHeight = image.naturalHeight * sourceScale;
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.cos(radians)) + Math.abs(sourceHeight * Math.sin(radians))));
      output.height = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.sin(radians)) + Math.abs(sourceHeight * Math.cos(radians))));
      const context = output.getContext("2d");
      if (!context) { setAdjusting(false); setMessage("画像を補正できませんでした。"); return; }
      context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
      context.translate(output.width / 2, output.height / 2); context.rotate(radians);
      context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      const adjusted = new Image();
      adjusted.onload = () => { showImage(adjusted, nextMessage); setAdjusting(false); };
      adjusted.onerror = () => { setMessage("画像を補正できませんでした。"); setAdjusting(false); };
      adjusted.src = output.toDataURL("image/jpeg", .94);
    });
  };
  const straighten = () => {
    const image = imageRef.current;
    if (!image || adjusting) return;
    setMessage("紙面の傾きを調べています…");
    const angle = estimateStraighteningAngle(image);
    if (!angle) { setMessage("大きな傾きは見つかりませんでした。そのまま囲めます。"); return; }
    rotateImage(angle, `傾きを約${Math.abs(angle).toFixed(1)}度補正しました。記事を囲んでください。`);
  };
  const restoreOriginal = () => {
    if (!originalImageRef.current || adjusting) return;
    showImage(originalImageRef.current, "最初の画像に戻しました。記事を囲んでください。");
  };
  const load = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setBox(null);
    setStageCount(1);
    setMessage("画像を読み込んでいます…");
    const image = new Image();
    image.onload = () => {
      originalImageRef.current = image;
      requestAnimationFrame(() => {
        showImage(image, "向きを直してから、読みたい記事を囲んでください。");
        URL.revokeObjectURL(image.src);
      });
    };
    image.onerror = () => setMessage("画像を開けませんでした。JPEGまたはPNGを選んでください。");
    image.src = URL.createObjectURL(file);
  };
  const position = (event: React.PointerEvent<HTMLCanvasElement>, rect = gestureRectRef.current || event.currentTarget.getBoundingClientRect()) => {
    const canvas = canvasRef.current!;
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) };
  };
  const beginSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    gestureRectRef.current = rect;
    pointerIdRef.current = event.pointerId;
    const point = position(event, rect);
    startRef.current = point;
    draftBoxRef.current = { x: point.x, y: point.y, w: 0, h: 0 };
    lockPage();
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(draftBoxRef.current);
  };
  const moveSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!startRef.current || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    draftBoxRef.current = { x: startRef.current.x, y: startRef.current.y, w: point.x - startRef.current.x, h: point.y - startRef.current.y };
    draw(draftBoxRef.current);
  };
  const finishSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!startRef.current || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    const finalBox = { x: startRef.current.x, y: startRef.current.y, w: point.x - startRef.current.x, h: point.y - startRef.current.y };
    draftBoxRef.current = finalBox;
    draw(finalBox);
    setBox(finalBox);
    startRef.current = null;
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    unlockPage();
  };
  const cancelSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (draftBoxRef.current) { draw(draftBoxRef.current); setBox(draftBoxRef.current); }
    startRef.current = null;
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    unlockPage();
  };
  const read = async () => {
    const image = imageRef.current, canvas = canvasRef.current; if (!image || !canvas || !box || reading) return;
    setReading(true); setMessage("高画質で記事を準備しています…");
    try {
      const left = Math.max(0, Math.min(box.x, box.x + box.w)), top = Math.max(0, Math.min(box.y, box.y + box.h));
      const sourceX = left * image.naturalWidth / canvas.width, sourceY = top * image.naturalHeight / canvas.height;
      const sourceW = Math.abs(box.w) * image.naturalWidth / canvas.width, sourceH = Math.abs(box.h) * image.naturalHeight / canvas.height;
      const analysis = document.createElement("canvas"), analysisScale = Math.min(1, 1800 / Math.max(sourceW, sourceH));
      analysis.width = Math.max(1, Math.round(sourceW * analysisScale)); analysis.height = Math.max(1, Math.round(sourceH * analysisScale));
      const context = analysis.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("画像を処理できませんでした。");
      context.fillStyle = "#fff"; context.fillRect(0, 0, analysis.width, analysis.height); context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, analysis.width, analysis.height);
      const tileCount = stageCount;
      const pixels = context.getImageData(0, 0, analysis.width, analysis.height).data;
      const rowInk = (row: number) => {
        let dark = 0, checked = 0;
        for (let y = Math.max(0, row - 2); y <= Math.min(analysis.height - 1, row + 2); y++) {
          for (let x = 0; x < analysis.width; x += 4) {
            const offset = (y * analysis.width + x) * 4;
            const brightness = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
            if (brightness < 205) dark++;
            checked++;
          }
        }
        return dark / Math.max(1, checked);
      };
      const boundaries = [0];
      for (let index = 1; index < tileCount; index++) {
        const ideal = analysis.height * index / tileCount;
        const radius = Math.max(24, analysis.height / tileCount * .28);
        const from = Math.max(boundaries[index - 1] + 30, Math.floor(ideal - radius));
        const to = Math.min(analysis.height - 30, Math.ceil(ideal + radius));
        let bestRow = Math.round(ideal), bestScore = Number.POSITIVE_INFINITY;
        for (let row = from; row <= to; row += 2) {
          const distancePenalty = Math.abs(row - ideal) / radius * .012;
          const score = rowInk(row) + distancePenalty;
          if (score < bestScore) { bestScore = score; bestRow = row; }
        }
        boundaries.push(bestRow);
      }
      boundaries.push(analysis.height);
      const readParts: string[] = [];
      let correctionTotal = 0, dualPassTotal = 0, organizedTotal = 0;
      for (let index = 0; index < tileCount; index++) {
        setMessage(`${index + 1}/${tileCount}段目を二重に読み取っています…`);
        const overlap = Math.min(24, Math.round(analysis.height / tileCount * .025));
        const tileTop = Math.max(0, boundaries[index] - (index ? overlap : 0));
        const tileBottom = Math.min(analysis.height, boundaries[index + 1] + (index < tileCount - 1 ? overlap : 0));
        const tileSourceY = sourceY + tileTop / analysis.height * sourceH;
        const tileSourceH = (tileBottom - tileTop) / analysis.height * sourceH;
        const outputScale = Math.min(1.65, 3400 / Math.max(sourceW, tileSourceH));
        const tile = document.createElement("canvas");
        tile.width = Math.max(1, Math.round(sourceW * outputScale)); tile.height = Math.max(1, Math.round(tileSourceH * outputScale));
        const tileContext = tile.getContext("2d", { willReadFrequently: true }); if (!tileContext) throw new Error("画像を分割できませんでした。");
        tileContext.fillStyle = "#fff"; tileContext.fillRect(0, 0, tile.width, tile.height);
        tileContext.imageSmoothingEnabled = true; tileContext.imageSmoothingQuality = "high";
        tileContext.drawImage(image, sourceX, tileSourceY, sourceW, tileSourceH, 0, 0, tile.width, tile.height);
        const enhanced = document.createElement("canvas"); enhanced.width = tile.width; enhanced.height = tile.height;
        const enhancedContext = enhanced.getContext("2d"); if (!enhancedContext) throw new Error("画像を補正できませんでした。");
        const imageData = tileContext.getImageData(0, 0, tile.width, tile.height), enhancedPixels = imageData.data;
        for (let offset = 0; offset < enhancedPixels.length; offset += 4) {
          const gray = enhancedPixels[offset] * .299 + enhancedPixels[offset + 1] * .587 + enhancedPixels[offset + 2] * .114;
          const value = Math.max(0, Math.min(255, (gray - 128) * 1.24 + 128));
          enhancedPixels[offset] = value; enhancedPixels[offset + 1] = value; enhancedPixels[offset + 2] = value;
        }
        enhancedContext.putImageData(imageData, 0, 0);
        let quality = .94, imageDataUrls = [tile.toDataURL("image/jpeg", quality), enhanced.toDataURL("image/jpeg", quality)];
        while (imageDataUrls.reduce((sum, value) => sum + value.length, 0) > 3_500_000 && quality > .78) {
          quality -= .04;
          imageDataUrls = [tile.toDataURL("image/jpeg", quality), enhanced.toDataURL("image/jpeg", quality)];
        }
        if (imageDataUrls.reduce((sum, value) => sum + value.length, 0) > 3_700_000) imageDataUrls = [enhanced.toDataURL("image/jpeg", .9)];
        const previousText = readParts.join("\n").slice(-900);
        const response = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrls, dualPass: imageDataUrls.length === 2, layoutHint: stageCount > 1 ? "vertical" : "auto", previousText, partIndex: index, partCount: tileCount }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || `${index + 1}段目の読み取りに失敗しました。`);
        if (!data.text?.trim()) throw new Error(`${index + 1}段目の文字を読み取れませんでした。`);
        readParts.push(data.text.trim());
        correctionTotal += data.correctedCount || 0;
        dualPassTotal += data.dualPassUsed ? 1 : 0;
        organizedTotal += data.organizedByAI ? 1 : 0;
      }
      const mergedText = readParts.reduce((merged, part) => {
        if (!merged) return part;
        const currentLines = merged.split(/\r?\n/), nextLines = part.split(/\r?\n/);
        let overlap = 0;
        for (let size = Math.min(10, currentLines.length, nextLines.length); size >= 1; size--) {
          if (currentLines.slice(-size).join("") === nextLines.slice(0, size).join("")) { overlap = size; break; }
        }
        return [...currentLines, ...nextLines.slice(overlap)].join("\n");
      }, "");
      onRead(mergedText);
      const correctionMessage = correctionTotal ? ` 明確な誤読を${correctionTotal}か所補正しました。` : "";
      const dualMessage = dualPassTotal === tileCount ? "各段を通常画像と補正画像で二重に照合しました。" : "高画質画像を優先して読み取りました。";
      const orderMessage = organizedTotal === tileCount ? " OpenAIが元画像を見て、見出し・本文・段組み・前段からの続きを確認しました。"
        : organizedTotal ? " 一部はOpenAI画像読解を利用できず、Google OCRの結果を使用しました。"
        : " OpenAI画像読解を利用できず、Google OCRの結果を使用しました。";
      setMessage("記事を読み取りました。" + dualMessage + orderMessage + correctionMessage + " 下の学年ボタンから進めます。");
    } catch (cause) { setMessage("エラー：" + (cause instanceof Error ? cause.message : "読み取りに失敗しました。")); }
    finally { setReading(false); }
  };
  return <section className="scanner">
    <div className="scanner-head">
      <SectionTitle number="1" title="記事を撮影する" note="読みたい記事を真上から、明るい場所で撮ってください。"/>
      <div className="file-buttons">
        <label><Camera size={18}/>カメラで撮る<input type="file" accept="image/*" capture="environment" onChange={(event) => load(event.target.files?.[0])}/></label>
        <label className="sub"><ImagePlus size={18}/>画像を選ぶ<input type="file" accept="image/*" onChange={(event) => load(event.target.files?.[0])}/></label>
      </div>
    </div>
    {fileName && <div className="crop">
      <SectionTitle number="2" title="写真の向きを整えて、記事を囲んで指定する" note={'指かマウスで記事を囲み、赤線の内側に入れてください。\n斜めなら「自動でまっすぐ」を押してから、読みたい記事を囲みます。'}/>
      <div className="image-adjustments">
        <button type="button" disabled={adjusting} onClick={() => rotateImage(-90, "左へ回転しました。記事を囲んでください。")}><RotateCcw size={17}/>左回転</button>
        <button type="button" className="straighten" disabled={adjusting} onClick={straighten}><Sparkles size={17}/>{adjusting ? "補正中…" : "自動でまっすぐ"}</button>
        <button type="button" disabled={adjusting} onClick={() => rotateImage(90, "右へ回転しました。記事を囲んでください。")}>右回転<RotateCcw className="rotate-right" size={17}/></button>
        <button type="button" disabled={adjusting} onClick={restoreOriginal}>元に戻す</button>
      </div>
      <div className="stage-picker"><span>この記事は何段ですか？</span><div>{[1,2,3,4].map((count) => <button type="button" key={count} className={stageCount === count ? "active" : ""} onClick={() => setStageCount(count)}><b>{count}</b>段{count === 1 && <span>（横書きの記事）</span>}</button>)}</div><small>縦書きは、紙面が上下に分かれている数を選びます。</small></div>
      <div className="canvas-wrap"><canvas ref={canvasRef} onContextMenu={(event) => event.preventDefault()} onPointerDown={beginSelection} onPointerMove={moveSelection} onPointerUp={finishSelection} onPointerCancel={cancelSelection}/></div>
      <div className="scan-actions"><button className="reset" onClick={() => { setBox(null); setMessage("もう一度、記事を囲んでください。"); }}><RotateCcw size={16}/>囲み直す</button><button className="primary" disabled={!box || Math.abs(box.w) < 30 || Math.abs(box.h) < 30 || reading} onClick={read}><ScanLine size={20}/>{reading ? stageCount + "段を読み取り中…" : stageCount + "段の記事を読み取る"}</button></div>
      {message && <p className={message.startsWith("エラー") ? "message error" : "message"}>{message}</p>}
    </div>}
  </section>;
}
