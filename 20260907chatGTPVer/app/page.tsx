"use client";

import { useEffect, useRef, useState } from "react";
import ArticleEditor, { type ArticleImage } from "./article-editor";
import { normalizeGeneratedResult } from "@/lib/display-text";
import { Camera, Check, Copy, ImagePlus, RotateCcw, ScanLine, Sparkles } from "lucide-react";

type Point = { x: number; y: number };
type Result = { title: string; body: string; points: string[]; words: [string, string][]; why: string; relation: string; quiz: { question: string; answer: string }[] };
type ReadingReview = { summary: string; uncertainSegments: string[]; excludedElements: string[]; confidence: "high" | "medium" | "low"; layout: "vertical" | "horizontal" | "mixed" };
const grades = [
  { id: "小4", label: "小学4年", note: "やさしく短く" }, { id: "小5", label: "小学5年", note: "理由もわかる" },
  { id: "小6", label: "小学6年", note: "原因と結果" }, { id: "中1", label: "中学1年", note: "要点を整理" },
  { id: "中2", label: "中学2年", note: "背景も整理" }, { id: "中3", label: "中学3年", note: "原文に近く" },
];

export default function Home() {
  const [text, setText] = useState(""), [grade, setGrade] = useState("小4");
  const [articleImage, setArticleImage] = useState<ArticleImage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null), [converting, setConverting] = useState(false);
  const [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const selectedGrade = grades.find((item) => item.id === grade)!;
  const convert = async () => {
    if (!text.trim() || converting || scanning) return;
    setConverting(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim(), grade }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "変換に失敗しました。");
      setResult(normalizeGeneratedResult(data)); setTimeout(() => document.querySelector("#result")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "変換に失敗しました。"); }
    finally { setConverting(false); }
  };
  return <main>
    <header className="topbar"><div className="brand"><span>読</span><div>新聞をわかりやすく<small>NEWS READER FOR STUDENTS</small></div></div><div className="version"><b>Ver.4.4</b></div></header>
    <section className="hero"><p><Sparkles size={16}/>新聞がわかる。社会が近くなる。</p><h1>気になるニュースを<br/>読みやすい<span className="word-highlight">言葉</span>へ</h1><div className="flow"><span><b>1</b>撮る</span><span><b>2</b>囲む</span><span><b>3</b>学年を選ぶ</span></div></section>
    <Scanner onBusy={setScanning} onRead={(value, _review, source) => { setText(value); setArticleImage(source || null); setResult(null); }}/>
    <section className="workspace">
      <div className="panel"><SectionTitle number="3" title="読み取った文章" note=""/><p className="digital-paste-note">デジタル記事のテキストは、ここにコピー＆ペーストしてください。</p><p className="edit-note">直したいところがある場合は、ここで直せます。</p><ArticleEditor text={text} source={articleImage} disabled={scanning || converting} onChange={(value) => { setText(value); setResult(null); }}/></div>
      <div className="panel"><SectionTitle number="4" title="読む人の学年を選ぶ" note="学年に合う言葉と文の長さに整えます。"/><div className="grades">{grades.map((item) => <button key={item.id} className={grade === item.id ? "grade active" : "grade"} onClick={() => { setGrade(item.id); setResult(null); }}><b>{item.id}</b><span>{item.label}</span><small>{item.note}</small>{grade === item.id && <Check size={15}/>}</button>)}</div><button className="primary" disabled={!text.trim() || converting || scanning} onClick={convert}><Sparkles size={19}/>{converting ? "わかりやすくしています…" : selectedGrade.label + "向けにする"}</button>{error && <p className="message error">{error}</p>}<p className="privacy">画像は読み取りのためGoogle Cloudへ、画像と文章は内容の確認・学年別変換のためOpenAI APIへ送信します。</p></div>
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

function smoothPath(points: Point[]) {
  if (points.length < 3) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const before = points[index - 1], after = points[index + 1];
    return { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4 };
  });
}

function distanceFromLine(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let farthest = 0, farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceFromLine(points[index], points[0], points[points.length - 1]);
    if (distance > farthest) { farthest = distance; farthestIndex = index; }
  }
  if (farthest <= tolerance) return [points[0], points[points.length - 1]];
  const before = simplifyPath(points.slice(0, farthestIndex + 1), tolerance);
  const after = simplifyPath(points.slice(farthestIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

function stabilizePath(points: Point[], width: number, height: number) {
  if (points.length < 3) return points;
  const smoothed = smoothPath(smoothPath(points));
  const simplified = simplifyPath(smoothed, Math.max(1.5, Math.hypot(width, height) / 360));
  const stabilized: Point[] = [simplified[0]];
  for (const point of simplified.slice(1)) {
    const previous = stabilized[stabilized.length - 1];
    const dx = point.x - previous.x, dy = point.y - previous.y;
    if (Math.abs(dx) < Math.abs(dy) * .14) stabilized.push({ x: previous.x, y: point.y });
    else if (Math.abs(dy) < Math.abs(dx) * .14) stabilized.push({ x: point.x, y: previous.y });
    else stabilized.push(point);
  }
  return stabilized;
}

function Scanner({ onRead, onBusy }: { onBusy: (busy: boolean) => void; onRead: (text: string, review?: ReadingReview, source?: ArticleImage) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), originalImageRef = useRef<HTMLImageElement | null>(null);
  const draftPathRef = useRef<Point[]>([]), pointerIdRef = useRef<number | null>(null), gestureRectRef = useRef<DOMRect | null>(null);
  const [fileName, setFileName] = useState(""), [selectionPath, setSelectionPath] = useState<Point[]>([]);
  const [reading, setReading] = useState(false), [adjusting, setAdjusting] = useState(false), [message, setMessage] = useState("");
  const [tracing, setTracing] = useState(false);
  const lockPage = () => document.documentElement.classList.add("crop-locked");
  const unlockPage = () => {
    document.documentElement.classList.remove("crop-locked");
  };
  const draw = (path = selectionPath, completed = true) => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (path.length < 2) return;
    if (completed && path.length > 2) {
      context.save();
      context.beginPath();
      context.rect(0, 0, canvas.width, canvas.height);
      context.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) context.lineTo(point.x, point.y);
      context.closePath();
      context.fillStyle = "rgba(16,30,40,.45)";
      context.fill("evenodd");
      context.restore();
    }
    context.beginPath();
    context.moveTo(path[0].x, path[0].y);
    for (const point of path.slice(1)) context.lineTo(point.x, point.y);
    if (completed && path.length > 2) context.closePath();
    context.strokeStyle = "#df3e32"; context.lineWidth = Math.max(4, canvas.width / 220); context.setLineDash([14, 8]);
    context.stroke(); context.setLineDash([]);
  };
  useEffect(() => { draw(); }, [selectionPath]);
  useEffect(() => {
    const stopTouchScroll = (event: TouchEvent) => { if (pointerIdRef.current !== null) event.preventDefault(); };
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
    setSelectionPath([]);
    setTracing(false);
    setMessage(nextMessage);
    requestAnimationFrame(() => draw([]));
  };
  const rotateImage = (degrees: number, nextMessage: string) => {
    const image = imageRef.current;
    if (!image || adjusting) return;
    setAdjusting(true);
    requestAnimationFrame(() => {
      const radians = degrees * Math.PI / 180;
      const sourceScale = 1;
      const sourceWidth = image.naturalWidth * sourceScale, sourceHeight = image.naturalHeight * sourceScale;
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.cos(radians)) + Math.abs(sourceHeight * Math.sin(radians))));
      output.height = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.sin(radians)) + Math.abs(sourceHeight * Math.cos(radians))));
      if (output.width * output.height > 40_000_000) { setAdjusting(false); setMessage("画像が大きすぎて回転できません。記事に近づいて撮り直してください。"); return; }
      const context = output.getContext("2d");
      if (!context) { setAdjusting(false); setMessage("画像を補正できませんでした。"); return; }
      context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
      context.translate(output.width / 2, output.height / 2); context.rotate(radians);
      context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
      const adjusted = new Image();
      adjusted.onload = () => { showImage(adjusted, nextMessage); setAdjusting(false); };
      adjusted.onerror = () => { setMessage("画像を補正できませんでした。"); setAdjusting(false); };
      adjusted.src = output.toDataURL("image/png");
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
    if (!file || reading) return;
    setFileName(file.name);
    setSelectionPath([]);
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
    if (!tracing || selectionPath.length) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    gestureRectRef.current = rect;
    pointerIdRef.current = event.pointerId;
    const point = position(event, rect);
    draftPathRef.current = [point];
    lockPage();
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(smoothPath(draftPathRef.current), false);
  };
  const moveSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftPathRef.current.length || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    const previous = draftPathRef.current[draftPathRef.current.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < Math.max(2, canvasRef.current!.width / 500)) return;
    draftPathRef.current.push(point);
    draw(smoothPath(draftPathRef.current), false);
  };
  const finishSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftPathRef.current.length || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    const finalPath = stabilizePath([...draftPathRef.current, point], event.currentTarget.width, event.currentTarget.height);
    setSelectionPath(finalPath);
    draw(finalPath);
    draftPathRef.current = [];
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    unlockPage();
    setTracing(false);
    setMessage("囲みを保持しました。よければ「この記事を読み取る」を押してください。");
  };
  const cancelSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (draftPathRef.current.length > 2) setSelectionPath([...draftPathRef.current]);
    draftPathRef.current = [];
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    unlockPage();
    setTracing(false);
  };
  const read = async () => {
    const image = imageRef.current, canvas = canvasRef.current;
    if (!image || !canvas || selectionPath.length < 3 || reading) return;
    setReading(true); onBusy(true); setMessage("記事の画像を準備しています…");
    try {
      const xs = selectionPath.map((point) => point.x), ys = selectionPath.map((point) => point.y);
      const left = Math.max(0, Math.min(...xs)), top = Math.max(0, Math.min(...ys));
      const right = Math.min(canvas.width, Math.max(...xs)), bottom = Math.min(canvas.height, Math.max(...ys));
      const sourceX = left * image.naturalWidth / canvas.width, sourceY = top * image.naturalHeight / canvas.height;
      const sourceW = (right - left) * image.naturalWidth / canvas.width, sourceH = (bottom - top) * image.naturalHeight / canvas.height;
      if (sourceW < 10 || sourceH < 10) throw new Error("記事のまわりを、もう少し広く囲んでください。");
      if (sourceW * sourceH > 40_000_000) throw new Error("画像が大きすぎます。記事の範囲を少し小さくしてください。");
      // Submit the complete article at source resolution, without cutting columns
      // at guessed gutters. NDLOCR handles the layout on the complete masked crop.
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(sourceW)); output.height = Math.max(1, Math.round(sourceH));
      const context = output.getContext("2d");
      if (!context) throw new Error("画像を準備できませんでした。");
      context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
      context.save(); context.beginPath();
      selectionPath.forEach((point, index) => {
        const x = (point.x - left) / (right - left) * output.width;
        const y = (point.y - top) / (bottom - top) * output.height;
        if (!index) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath(); context.clip();
      context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, output.width, output.height);
      context.restore();
      // Prefer lossless PNG; JPEG is only a transfer-size fallback, never resize.
      let imageDataUrl = output.toDataURL("image/png");
      if (imageDataUrl.length > 3_500_000) imageDataUrl = output.toDataURL("image/jpeg", .96);
      if (imageDataUrl.length > 3_500_000) throw new Error("画質を保って送るには、記事の範囲をもう少し小さくしてください。");
      setMessage("記事を読み取っています。初回は少し時間がかかります…");
      const response = await fetch("/api/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrls: [imageDataUrl] }), signal: AbortSignal.timeout(230_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.text !== "string" || !data.text.trim()) throw new Error(data?.error || "読み取りに失敗しました。");
      const rawText = data.text;
      // Make the OCR output available even if article understanding later fails.
      const source: ArticleImage = { imageDataUrl, width: output.width, height: output.height, regions: Array.isArray(data.ocrRegions) ? data.ocrRegions : [] };
      onRead(rawText, undefined, source);
      setMessage("読み取れました。記事の順番と内容を確認しています…");
      let finalText = rawText;
      let review: ReadingReview | undefined;
      try {
        const regions = Array.isArray(data.ocrRegions) ? data.ocrRegions : [];
        // Do not organize a partial positional result and silently drop text.
        const compact = (value: string) => value.replace(/\s/g, "");
        if (!regions.length || compact(regions.map((r: { text: string }) => r.text).join("")) !== compact(rawText)) {
          throw new Error("位置情報と読み取り結果が一致しませんでした。");
        }
        const finalResponse = await fetch("/api/ocr/finalize", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, ocrRegions: regions }), signal: AbortSignal.timeout(65_000),
        });
        const finalData = await finalResponse.json().catch(() => null);
        if (!finalResponse.ok || typeof finalData?.text !== "string" || !finalData.text.trim()) throw new Error("記事の確認を完了できませんでした。");
        finalText = finalData.text;
        review = {
          summary: finalData.summary || "記事の順番を確認しました。",
          uncertainSegments: Array.isArray(finalData.uncertainSegments) ? finalData.uncertainSegments : [],
          excludedElements: Array.isArray(finalData.excludedElements) ? finalData.excludedElements : [],
          confidence: finalData.confidence || "medium", layout: finalData.layout || "mixed",
        };
      } catch {
        // Keep the complete raw transcript; no AI-generated substitute.
      }
      onRead(finalText, review, source);
      setMessage(review ? "記事を読み取りました。原文と見比べてから、学年を選んでください。"
        : "文字は読み取れました。記事の内容確認は完了していません。原文と見比べてから、学年を選んでください。");
    } catch (cause) {
      const timeout = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      setMessage("エラー：" + (timeout ? "待ち時間を超えました。少し待ってからお試しください。"
        : cause instanceof Error ? cause.message : "読み取りに失敗しました。"));
    } finally { setReading(false); onBusy(false); }
  };
  return <section className="scanner">
    <div className="scanner-head">
      <SectionTitle number="1" title="記事を撮影する" note="読みたい記事を真上から、明るい場所で撮ってください。"/>
      <div className="file-buttons">
        <label><Camera size={18}/>カメラで撮る<input type="file" accept="image/*" disabled={reading} capture="environment" onChange={(event) => load(event.target.files?.[0])}/></label>
        <label className="sub"><ImagePlus size={18}/>画像を選ぶ<input type="file" accept="image/*" disabled={reading} onChange={(event) => load(event.target.files?.[0])}/></label>
      </div>
    </div>
    {fileName && <div className="crop">
      <SectionTitle number="2" title="写真の向きを整えて、記事を囲む" note={'「記事を囲む」を押し、読みたい記事のまわりを人差し指でなぞってください。\n指を離しても赤線は残ります。斜めなら先に「自動でまっすぐ」を押します。'}/>
      <div className="image-adjustments">
        <button type="button" disabled={adjusting || reading} onClick={() => rotateImage(-90, "左へ回転しました。記事を囲んでください。")}><RotateCcw size={17}/>左回転</button>
        <button type="button" className="straighten" disabled={adjusting || reading} onClick={straighten}><Sparkles size={17}/>{adjusting ? "補正中…" : "自動でまっすぐ"}</button>
        <button type="button" disabled={adjusting || reading} onClick={() => rotateImage(90, "右へ回転しました。記事を囲んでください。")}>右回転<RotateCcw className="rotate-right" size={17}/></button>
        <button type="button" disabled={adjusting || reading} onClick={restoreOriginal}>元に戻す</button>
      </div>
      <button type="button" className={tracing ? "trace-guide active" : "trace-guide"} disabled={reading || selectionPath.length > 0} onClick={() => { setTracing(true); setMessage("読みたい記事のまわりを人差し指でなぞってください。"); }}><ScanLine size={20}/><b>{tracing ? "なぞっています" : selectionPath.length ? "囲みを保持しています" : "記事を囲む"}</b><span>{tracing ? "指の動きに沿って、一本の赤線を描きます。" : selectionPath.length ? "よければ読み取り、違えば囲み直してください。" : "押してから、記事のまわりを人差し指でなぞります。"}</span></button>
      <div className={tracing ? "canvas-wrap tracing" : "canvas-wrap"}><canvas ref={canvasRef} onContextMenu={(event) => event.preventDefault()} onPointerDown={beginSelection} onPointerMove={moveSelection} onPointerUp={finishSelection} onPointerCancel={cancelSelection}/></div>
      <div className="scan-actions"><button className="reset" disabled={reading} onClick={() => { draftPathRef.current = []; setSelectionPath([]); setTracing(false); draw([]); setMessage("「記事を囲む」を押して、もう一度なぞってください。"); }}><RotateCcw size={16}/>囲み直す</button><button className="primary" disabled={selectionPath.length < 3 || reading || adjusting} onClick={read}><ScanLine size={20}/>{reading ? "記事を読み取り中…" : "この記事を読み取る"}</button></div>
      {message && <p className={message.startsWith("エラー") ? "message error" : "message"}>{message}</p>}
    </div>}
  </section>;
}
