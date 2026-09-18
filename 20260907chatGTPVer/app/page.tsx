"use client";

import { straightenOutline } from "@/lib/crop-path";

import { useEffect, useRef, useState } from "react";
import ArticleEditor, { type ArticleImage } from "./article-editor";
import { normalizeGeneratedResult } from "@/lib/display-text";
import { Camera, Check, Copy, ImagePlus, RotateCcw, ScanLine, Sparkles } from "lucide-react";

type Point = { x: number; y: number };
type Result = { title: string; body: string; detailBody: string; points: string[]; words: [string, string][]; why: string; relation: string; quiz: { question: string; answer: string; evidence: string }[] };
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
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState<number | null>(null);
  const [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const selectedGrade = grades.find((item) => item.id === grade)!;
  const convert = async () => {
    if (!text.trim() || converting || scanning) return;
    setConverting(true); setResult(null); setActiveEvidenceIndex(null); setError("");
    try {
      const response = await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim(), grade }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "変換に失敗しました。");
      const normalized = normalizeGeneratedResult(data) as Result;
      setActiveEvidenceIndex(null);
      setResult(normalized); setTimeout(() => document.querySelector("#result")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "変換に失敗しました。"); }
    finally { setConverting(false); }
  };
  return <main>
    <header className="topbar"><div className="brand"><span>読</span><div>新聞をわかりやすく<small>NEWS READER FOR STUDENTS</small></div></div><div className="version"><b>Ver.4.9</b></div></header>
    <section className="hero"><p><Sparkles size={16}/>新聞がわかる。社会が近くなる。</p><h1>気になるニュースを<br/>読みやすい<span className="word-highlight">言葉</span>へ</h1><div className="flow" aria-label="使い方の順番"><span><b>1</b>えらぶ</span><span><b>2</b>囲む</span><span><b>3</b>たしかめる</span><span><b>4</b>学年</span></div></section>
    <Scanner onBusy={setScanning} onRead={(value, _review, source) => { setText(value); setArticleImage(source || null); setResult(null); setActiveEvidenceIndex(null); }}/>
    <section className="workspace">
      <div className="panel" id="check-article"><SectionTitle number="3" title="読みまちがいを直そう" note=""/><p className="digital-paste-note">ネットの記事は、文章をコピーして下にはりつけても使えます。</p><p className="edit-note">写真と文章を見くらべて、ちがう文字を直してね。</p><ArticleEditor text={text} source={articleImage} disabled={scanning || converting} onChange={(value) => { setText(value); setResult(null); setActiveEvidenceIndex(null); }}/>{text.trim() && <a className="next-step" href="#choose-grade">たしかめたら、学年をえらぶ ↓</a>}</div>
      <div className="panel" id="choose-grade"><SectionTitle number="4" title="読む人の学年をえらぼう" note="学年をえらんで、下の青いボタンを押してね。"/><div className="grades">{grades.map((item) => <button key={item.id} className={grade === item.id ? "grade active" : "grade"} onClick={() => { setGrade(item.id); setResult(null); setActiveEvidenceIndex(null); }}><b>{item.id}</b><span>{item.label}</span><small>{item.note}</small>{grade === item.id && <Check size={15}/>}</button>)}</div><button className="primary" disabled={!text.trim() || converting || scanning} onClick={convert}><Sparkles size={19}/>{converting ? "わかりやすくしています…" : selectedGrade.label + "の言葉で読む"}</button>{error && <p className="message error">{error}</p>}<p className="privacy">画像は読み取りのためGoogle Cloudへ、画像と文章は内容の確認・学年別変換のためOpenAI APIへ送信します。</p></div>
    </section>
    {result && <section id="result" className="result"><div className="result-heading"><div><small>{grade}向け</small><h2>{result.title}</h2></div><button onClick={async () => { await navigator.clipboard.writeText(result.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "コピーしました" : "コピー"}</button></div><div className="article-first"><p><b>学年に合わせて読む</b><br/><small>あなたの学年でわかる言葉にしています。</small></p><p className="article" id="grade-article-body"><HighlightedArticle text={result.body} evidence={activeEvidenceIndex !== null ? result.quiz[activeEvidenceIndex]?.evidence ?? "" : ""}/></p></div>{result.detailBody && <details className="article-detail" style={{ marginTop: "18px" }}>
  <summary
    style={{
      cursor: "pointer",
      listStyle: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      width: "100%",
      boxSizing: "border-box",
      padding: "16px 18px",
      border: "2px solid #2f6fd6",
      borderRadius: "14px",
      background: "#eef5ff",
      fontWeight: 800,
      fontSize: "1.05rem",
      color: "#184f9f",
      boxShadow: "0 3px 10px rgba(47,111,214,.12)",
    }}
  >
    <span>
      <span style={{ display: "block", fontSize: ".78rem", fontWeight: 700, color: "#5c6f87", marginBottom: "3px" }}>
        もう少し知りたい人へ
      </span>
      もっとくわしく読む
    </span>
    <span aria-hidden="true" style={{ fontSize: "1.2rem" }}>▼</span>
  </summary>
  <div
    style={{
      marginTop: "10px",
      padding: "16px 18px",
      borderRadius: "12px",
      background: "#f8fbff",
      border: "1px solid #d8e6fa",
    }}
  >
    <p className="article">{result.detailBody}</p>
  </div>
</details>}<div className="result-grid"><section><h3>大事なこと</h3><ol>{result.points.map((point, index) => <li key={index}><b>{index + 1}</b>{point}</li>)}</ol></section><section><h3>ニュースの言葉</h3>{result.words.map(([word, meaning]) => <dl key={word}><dt>{word}</dt><dd>{meaning}</dd></dl>)}</section><section><h3>どうして？</h3><p>{result.why}</p></section><section className="quiz-section"><h3>わかったかな？</h3>{result.quiz.map((item, index) => <QuizItem
  key={index}
  number={index + 1}
  question={item.question}
  answer={item.answer}
  evidence={item.evidence}
  isEvidenceActive={activeEvidenceIndex === index}
  onEvidenceToggle={(show) => {
    setActiveEvidenceIndex(show ? index : null);
    if (show) {
      setTimeout(() => document.querySelector("#evidence-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }
  }}
/>)}</section></div></section>}
    <footer>新聞記事 AI学年別理解サポート（試作版）</footer>
  </main>;
}

function SectionTitle({ number, title, note }: { number: string; title: string; note: string }) {
  return <div className="section-title"><b>{number}</b><div><h2>{title}</h2><p>{note}</p></div></div>;
}

function HighlightedArticle({ text, evidence }: { text: string; evidence: string }) {
  if (!evidence) return <>{text}</>;
  const index = text.indexOf(evidence);
  if (index < 0) return <>{text}</>;

  return <>
    {text.slice(0, index)}
    <mark
      id="evidence-highlight"
      style={{
        background: "#ffef8a",
        color: "inherit",
        borderRadius: "4px",
        padding: "1px 2px",
        boxShadow: "0 0 0 2px rgba(255, 214, 0, .18)",
      }}
    >
      {evidence}
    </mark>
    {text.slice(index + evidence.length)}
  </>;
}

function QuizItem({
  number,
  question,
  answer,
  evidence,
  isEvidenceActive,
  onEvidenceToggle,
}: {
  number: number;
  question: string;
  answer: string;
  evidence: string;
  isEvidenceActive: boolean;
  onEvidenceToggle: (show: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return <div className="quiz-item">
    <p><b>Q{number}</b>{question}</p>
    <button
      type="button"
      onClick={() => {
        const nextOpen = !open;
        setOpen(nextOpen);
        if (!nextOpen && isEvidenceActive) onEvidenceToggle(false);
      }}
    >
      {open ? "答えを隠す" : "答えを見る"}
    </button>

    {open && <div className="quiz-answer">
      <b>答え</b><span>{answer}</span>
      {evidence && <>
        <button
          type="button"
          onClick={() => onEvidenceToggle(!isEvidenceActive)}
          style={{
            marginTop: "12px",
            alignSelf: "flex-start",
            border: "1px solid #7aa4d8",
            borderRadius: "999px",
            background: isEvidenceActive ? "#fff7c8" : "#f4f8fd",
            color: "#245f9e",
            fontWeight: 700,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          {isEvidenceActive ? "マークを消す" : "どこを読めばわかる？"}
        </button>
        {isEvidenceActive && <small style={{ display: "block", marginTop: "8px", color: "#5c6f87", lineHeight: 1.6 }}>
          上の「学年に合わせて読む」の中をマークしたよ。
        </small>}
      </>}
    </div>}
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
  // Preserve the finger's shape; do not snap edges to horizontal or vertical.
  return simplifyPath(points, Math.max(.5, Math.hypot(width, height) / 1800));
}

function Scanner({ onRead, onBusy }: { onBusy: (busy: boolean) => void; onRead: (text: string, review?: ReadingReview, source?: ArticleImage) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), originalImageRef = useRef<HTMLImageElement | null>(null);
  const draftPathRef = useRef<Point[]>([]), pointerIdRef = useRef<number | null>(null), gestureRectRef = useRef<DOMRect | null>(null);
  const [fileName, setFileName] = useState(""), [selectionPath, setSelectionPath] = useState<Point[]>([]);
  const [reading, setReading] = useState(false), [adjusting, setAdjusting] = useState(false), [message, setMessage] = useState("");
  const [tracing, setTracing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cropExpanded, setCropExpanded] = useState(false);
  useEffect(() => { if (!cropExpanded) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, [cropExpanded]);
  const [history, setHistory] = useState<Point[][]>([]);
  const editIndex = useRef(-1), beforeEdit = useRef<Point[]>([]);
  const editBase = useRef<Point[]>([]), dragStart = useRef<Point>({x:0,y:0});
  const editWeights = useRef<number[]>([]);
  const moveEditedLine = (point: Point) => {
    const canvas = canvasRef.current!;
    draftPathRef.current = editBase.current.map((p, i) => ({
      x: Math.max(0, Math.min(canvas.width, p.x+(point.x-dragStart.current.x)*editWeights.current[i])),
      y: Math.max(0, Math.min(canvas.height, p.y+(point.y-dragStart.current.y)*editWeights.current[i])),
    }));
  };
  const frame = useRef<number | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const scheduleDraw = (completed: boolean) => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; draw(draftPathRef.current, completed); });
  };
  const stopFrame = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  const lockPage = () => document.documentElement.classList.add("crop-locked");
  const unlockPage = () => {
    document.documentElement.classList.remove("crop-locked");
  };
  const draw = (path = selectionPath, completed = true) => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(previewRef.current || image, 0, 0, canvas.width, canvas.height);
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
    context.strokeStyle = "#df3e32"; context.lineWidth = Math.max(4, canvas.width / 220); context.lineJoin = "round"; context.lineCap = "round"; context.setLineDash([]);
    context.stroke(); context.setLineDash([]);
  };
  useEffect(() => { draw(); }, [selectionPath, editing]);
  useEffect(() => {
    const stopTouchScroll = (event: TouchEvent) => { if (pointerIdRef.current !== null) event.preventDefault(); };
    document.addEventListener("touchmove", stopTouchScroll, { passive: false });
    return () => { document.removeEventListener("touchmove", stopTouchScroll); unlockPage(); stopFrame(); };
  }, []);
  const showImage = (image: HTMLImageElement, nextMessage: string) => {
    imageRef.current = image;
    const canvas = canvasRef.current;
    if (!canvas) { setMessage("画像表示欄を準備できませんでした。もう一度選んでください。"); return; }
    const scale = Math.min(1, 1100 / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const preview = document.createElement("canvas");
    preview.width = canvas.width; preview.height = canvas.height;
    preview.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    previewRef.current = preview;
    stopFrame(); setEditing(false); setHistory([]);
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
    if (reading || adjusting || pointerIdRef.current !== null || (!tracing && !editing)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    gestureRectRef.current = rect;
    const point = position(event, rect);
    if (editing) {
      let distance = Infinity, segment = -1, projected = point;
      selectionPath.forEach((a, i) => {
        const b = selectionPath[(i + 1) % selectionPath.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
        const q = {x:a.x+t*dx, y:a.y+t*dy};
        const d = Math.hypot((q.x-point.x)*rect.width/event.currentTarget.width, (q.y-point.y)*rect.height/event.currentTarget.height);
        if (d < distance) { distance=d; segment=i; projected=q; }
      });
      if (distance > 28 || segment < 0) { gestureRectRef.current=null; return; }
      beforeEdit.current = selectionPath;
      draftPathRef.current = [...selectionPath];
      editIndex.current = segment + 1;
      draftPathRef.current.splice(editIndex.current, 0, projected);
      editBase.current = [...draftPathRef.current]; dragStart.current = point;
      const base = editBase.current, count = base.length;
      const distances = Array(count).fill(Infinity); distances[editIndex.current] = 0;
      for (const direction of [-1, 1]) {
        let length = 0, previous = editIndex.current;
        for (let step = 1; step < count; step++) {
          const i = (editIndex.current + direction*step + count) % count;
          length += Math.hypot((base[i].x-base[previous].x)*rect.width/event.currentTarget.width, (base[i].y-base[previous].y)*rect.height/event.currentTarget.height);
          distances[i] = Math.min(distances[i], length); previous = i;
        }
      }
      editWeights.current = distances.map((d) => d >= 36 ? 0 : (1+Math.cos(Math.PI*d/36))/2);
    } else { draftPathRef.current = [point]; }
    pointerIdRef.current = event.pointerId;
    lockPage();
    event.currentTarget.setPointerCapture(event.pointerId);
    scheduleDraw(editing);
  };
  const moveSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftPathRef.current.length || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    if (editing) {
      moveEditedLine(position(event));
    } else {
      const samples = event.nativeEvent.getCoalescedEvents?.() || [];
      for (const sample of samples.length ? samples : [event.nativeEvent]) {
        const rect = gestureRectRef.current!, canvas = event.currentTarget;
        const point = { x: Math.max(0, Math.min(canvas.width, (sample.clientX-rect.left)*canvas.width/rect.width)), y: Math.max(0, Math.min(canvas.height, (sample.clientY-rect.top)*canvas.height/rect.height)) };
        const previous = draftPathRef.current[draftPathRef.current.length-1];
        if (Math.hypot(point.x-previous.x,point.y-previous.y) >= .5) draftPathRef.current.push(point);
      }
    }
    scheduleDraw(editing);
  };
  const finishSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftPathRef.current.length || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = position(event);
    stopFrame();
    if (editing) moveEditedLine(point);
    const finalPath = editing ? [...draftPathRef.current] : stabilizePath([...draftPathRef.current, point], event.currentTarget.width, event.currentTarget.height);
    if (editing) setHistory((items) => [...items.slice(-19), beforeEdit.current]);
    setSelectionPath(finalPath);
    draw(finalPath);
    draftPathRef.current = [];
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    unlockPage();
    setTracing(false);
    setMessage("囲みを保持しました。「線を動かす」で赤線を動かせます。よければ読み取ってください。");
  };
  const cancelSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    stopFrame();
    draw(selectionPath);
    draftPathRef.current = [];
    pointerIdRef.current = null;
    gestureRectRef.current = null;
    unlockPage();
    setTracing(false);
  };
  const read = async () => {
    const image = imageRef.current, canvas = canvasRef.current;
    if (!image || !canvas || selectionPath.length < 3 || reading) return;
    setCropExpanded(false);
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
      <SectionTitle number="1" title="読みたい記事をえらぼう" note="新聞記事をカメラで撮るか、保存した写真をえらんでね。"/>
      <div className="file-buttons">
        <label><Camera size={18}/>カメラで撮る<input type="file" accept="image/*" disabled={reading} capture="environment" onChange={(event) => load(event.target.files?.[0])}/></label>
        <label className="sub"><ImagePlus size={18}/>写真をえらぶ<input type="file" accept="image/*" disabled={reading} onChange={(event) => load(event.target.files?.[0])}/></label>
      </div>
    </div>
    {fileName && <div className="photo-setup"><p>写真が横向き・ななめなら、ここで直そう。</p>
      <div className="image-adjustments">
        <button type="button" disabled={adjusting || reading} onClick={() => rotateImage(-90, "左へ回転しました。記事を囲んでください。")}><RotateCcw size={17}/>左に回す</button>
        <button type="button" className="straighten" disabled={adjusting || reading} onClick={straighten}><Sparkles size={17}/>{adjusting ? "直しています…" : "自動でまっすぐ"}</button>
        <button type="button" disabled={adjusting || reading} onClick={() => rotateImage(90, "右へ回転しました。記事を囲んでください。")}>右に回す<RotateCcw className="rotate-right" size={17}/></button>
        <button type="button" disabled={adjusting || reading} onClick={restoreOriginal}>写真をもとに戻す</button>
      </div>
    </div>}
    {fileName && <div className={cropExpanded ? "crop crop-expanded" : "crop"}>
      <button type="button" className="crop-expand" onClick={() => setCropExpanded(!cropExpanded)}>{cropExpanded ? "もとの大きさに戻す" : "大きな画面で囲む"}</button>
      <SectionTitle number="2" title="読みたいところを指定しよう" note={'「記事を囲む」を押して、読みたいところを指で囲んでね。'}/>

      <button type="button" className={tracing ? "trace-guide active" : "trace-guide"} disabled={reading || selectionPath.length > 0} onClick={() => { setTracing(true); setMessage("読みたい記事のまわりを人差し指でなぞってください。"); }}><ScanLine size={20}/><b>{tracing ? "なぞっています" : selectionPath.length ? "囲めたよ" : "記事を囲む"}</b><span>{tracing ? "指の動きに沿って、一本の赤線を描きます。" : selectionPath.length ? "よければ読み取り、「線を動かす」で赤線を動かせます。" : "押してから、記事のまわりを人差し指でなぞります。"}</span></button>
      <div className={tracing || editing ? "canvas-wrap tracing" : "canvas-wrap"}><canvas ref={canvasRef} onContextMenu={(event) => event.preventDefault()} onPointerDown={beginSelection} onPointerMove={moveSelection} onPointerUp={finishSelection} onPointerCancel={cancelSelection}/></div>
      {selectionPath.length >= 3 && <div className="scan-actions">
        <button type="button" className="reset" disabled={reading || adjusting} onClick={() => {
          if (pointerIdRef.current !== null) return;
          const canvas = canvasRef.current; if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const simplified = simplifyPath(selectionPath, 2 * canvas.width / rect.width);
          if (simplified.length < 3) return;
          const next = straightenOutline(simplified, rect.width / canvas.width, rect.height / canvas.height);
          setHistory(items => [...items.slice(-19), selectionPath]);
          setSelectionPath(next);
          setMessage("たて・よこの線を整えたよ。「ひとつ戻す」で戻せます。");
        }}>線を整える</button>
        <button type="button" className="reset" disabled={reading || adjusting} onClick={() => { setEditing(!editing); setMessage(editing ? "囲みができました。次は「この記事を読み取る」を押してね。" : "赤線の直したいところを押したまま動かしてください。線の近くならつかめます。"); }}>{editing ? "線の直しを終える" : "線を動かす"}</button>
        <button type="button" className="reset" disabled={reading || !history.length} onClick={() => { setSelectionPath(history[history.length-1]); setHistory(history.slice(0,-1)); }}>ひとつ戻す</button>
      </div>}
      <div className="scan-actions"><button className="reset" disabled={reading || adjusting} onClick={() => { stopFrame(); draftPathRef.current = []; setSelectionPath([]); setTracing(true); setEditing(false); setHistory([]); draw([]); setMessage("もう一度、読みたいところを指で囲んでね。"); }}><RotateCcw size={16}/>囲み直す</button><button className="primary" disabled={selectionPath.length < 3 || reading || adjusting} onClick={read}><ScanLine size={20}/>{reading ? "記事を読み取り中…" : "この記事を読み取る"}</button></div>
      {message && <p className={message.startsWith("エラー") ? "message error" : "message"}>{message}</p>}
    </div>}
  </section>;
}
