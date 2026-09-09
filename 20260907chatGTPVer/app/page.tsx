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
    <header className="topbar"><div className="brand"><span>読</span><div>新聞をわかりやすく<small>NEWS READER FOR STUDENTS</small></div></div><div className="version">精密OCR版 <b>Ver.2.6</b></div></header>
    <section className="hero"><p><Sparkles size={16}/>新聞が、わかる。社会が、近くなる。</p><h1>気になるニュースを、<br/>読みやすい<span className="word-highlight">言葉</span>へ。</h1><div className="flow"><span><b>1</b>撮る</span><span><b>2</b>囲む</span><span><b>3</b>学年を選ぶ</span></div></section>
    <Scanner onRead={(value) => { setText(value); setResult(null); }}/>
    <section className="workspace">
      <div className="panel"><SectionTitle number="3" title="読み取った文章" note="直したいところがあるときだけ、ここで直せます。"/><textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} placeholder="読み取った新聞記事がここに入ります。記事を直接貼り付けても使えます。" maxLength={5000}/><div className="counter">{text.length.toLocaleString()} / 5,000字</div></div>
      <div className="panel"><SectionTitle number="4" title="読む人の学年を選ぶ" note="学年に合う言葉と文の長さに整えます。"/><div className="grades">{grades.map((item) => <button key={item.id} className={grade === item.id ? "grade active" : "grade"} onClick={() => { setGrade(item.id); setResult(null); }}><b>{item.id}</b><span>{item.label}</span><small>{item.note}</small>{grade === item.id && <Check size={15}/>}</button>)}</div><button className="primary" disabled={!text.trim() || converting} onClick={convert}><Sparkles size={19}/>{converting ? "わかりやすくしています…" : selectedGrade.label + "向けにする"}</button>{error && <p className="message error">{error}</p>}<p className="privacy">画像と文章は保存しません。処理のためOpenAI APIへ送信します。</p></div>
    </section>
    {result && <section id="result" className="result"><div className="result-heading"><div><small>{grade}向け</small><h2>{result.title}</h2></div><button onClick={async () => { await navigator.clipboard.writeText(result.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "コピーしました" : "コピー"}</button></div><p className="article">{result.body}</p><div className="result-grid"><section><h3>大事なこと</h3><ol>{result.points.map((point, index) => <li key={index}><b>{index + 1}</b>{point}</li>)}</ol></section><section><h3>ニュースの言葉</h3>{result.words.map(([word, meaning]) => <dl key={word}><dt>{word}</dt><dd>{meaning}</dd></dl>)}</section><section><h3>どうして？</h3><p>{result.why}</p></section><section className="quiz-section"><h3>わかったかな？</h3>{result.quiz.map((item, index) => <QuizItem key={index} number={index + 1} question={item.question} answer={item.answer}/>)}</section></div></section>}
    <footer>新聞記事 学年別AI変換アプリ　試作版</footer>
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

function Scanner({ onRead }: { onRead: (text: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), imageRef = useRef<HTMLImageElement | null>(null), startRef = useRef<{ x: number; y: number } | null>(null);
  const [fileName, setFileName] = useState(""), [box, setBox] = useState<Box | null>(null);
  const [reading, setReading] = useState(false), [message, setMessage] = useState("");
  const [stageCount, setStageCount] = useState(1);
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
  const load = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setBox(null);
    setStageCount(1);
    setMessage("画像を読み込んでいます…");
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) { setMessage("画像表示欄を準備できませんでした。もう一度選んでください。"); return; }
        const scale = Math.min(1, 1100 / image.naturalWidth);
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        setMessage("読みたい記事を、見出しから本文の終わりまで囲んでください。");
        draw(null);
        URL.revokeObjectURL(image.src);
      });
    };
    image.onerror = () => setMessage("画像を開けませんでした。JPEGまたはPNGを選んでください。");
    image.src = URL.createObjectURL(file);
  };
  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) };
  };
  const read = async () => {
    const image = imageRef.current, canvas = canvasRef.current; if (!image || !canvas || !box || reading) return;
    setReading(true); setMessage("Google OCRで" + stageCount + "段を読み取っています…");
    try {
      const left = Math.max(0, Math.min(box.x, box.x + box.w)), top = Math.max(0, Math.min(box.y, box.y + box.h));
      const sourceX = left * image.naturalWidth / canvas.width, sourceY = top * image.naturalHeight / canvas.height;
      const sourceW = Math.abs(box.w) * image.naturalWidth / canvas.width, sourceH = Math.abs(box.h) * image.naturalHeight / canvas.height;
      const crop = document.createElement("canvas"), scale = Math.min(1, 2300 / Math.max(sourceW, sourceH));
      crop.width = Math.max(1, Math.round(sourceW * scale)); crop.height = Math.max(1, Math.round(sourceH * scale));
      const context = crop.getContext("2d"); if (!context) throw new Error("画像を処理できませんでした。");
      context.fillStyle = "#fff"; context.fillRect(0, 0, crop.width, crop.height); context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, crop.width, crop.height);
      const tileCount = stageCount;
      const pixels = context.getImageData(0, 0, crop.width, crop.height).data;
      const rowInk = (row: number) => {
        let dark = 0, checked = 0;
        for (let y = Math.max(0, row - 2); y <= Math.min(crop.height - 1, row + 2); y++) {
          for (let x = 0; x < crop.width; x += 4) {
            const offset = (y * crop.width + x) * 4;
            const brightness = pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114;
            if (brightness < 205) dark++;
            checked++;
          }
        }
        return dark / Math.max(1, checked);
      };
      const boundaries = [0];
      for (let index = 1; index < tileCount; index++) {
        const ideal = crop.height * index / tileCount;
        const radius = Math.max(24, crop.height / tileCount * .28);
        const from = Math.max(boundaries[index - 1] + 30, Math.floor(ideal - radius));
        const to = Math.min(crop.height - 30, Math.ceil(ideal + radius));
        let bestRow = Math.round(ideal), bestScore = Number.POSITIVE_INFINITY;
        for (let row = from; row <= to; row += 2) {
          const distancePenalty = Math.abs(row - ideal) / radius * .012;
          const score = rowInk(row) + distancePenalty;
          if (score < bestScore) { bestScore = score; bestRow = row; }
        }
        boundaries.push(bestRow);
      }
      boundaries.push(crop.height);
      const makeTiles = (quality: number) => Array.from({ length: tileCount }, (_, index) => {
        if (tileCount === 1) return crop.toDataURL("image/jpeg", quality);
        const overlap = Math.min(18, Math.round(crop.height / tileCount * .02));
        const tileTop = Math.max(0, boundaries[index] - (index ? overlap : 0));
        const tileBottom = Math.min(crop.height, boundaries[index + 1] + (index < tileCount - 1 ? overlap : 0));
        const tile = document.createElement("canvas");
        tile.width = crop.width; tile.height = tileBottom - tileTop;
        const tileContext = tile.getContext("2d");
        if (!tileContext) throw new Error("画像を分割できませんでした。");
        tileContext.fillStyle = "#fff"; tileContext.fillRect(0, 0, tile.width, tile.height);
        tileContext.drawImage(crop, 0, tileTop, crop.width, tile.height, 0, 0, tile.width, tile.height);
        return tile.toDataURL("image/jpeg", quality);
      });
      let quality = .82, imageDataUrls = makeTiles(quality);
      while (imageDataUrls.reduce((sum, value) => sum + value.length, 0) > 3_300_000 && quality > .5) { quality -= .08; imageDataUrls = makeTiles(quality); }
      if (imageDataUrls.reduce((sum, value) => sum + value.length, 0) > 3_600_000) throw new Error("記事の範囲を少し小さくして、もう一度お試しください。");
      const response = await fetch("/api/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrls }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "読み取りに失敗しました。");
      if (!data.text?.trim()) throw new Error("文字を読み取れませんでした。");
      onRead(data.text.trim());
      const orderMessage = data.reordered ? " 縦書きの読む順番も整えました。" : "";
      setMessage("記事を読み取りました。" + orderMessage + "下の学年ボタンから、そのまま進めます。");
    } catch (cause) { setMessage("エラー：" + (cause instanceof Error ? cause.message : "読み取りに失敗しました。")); }
    finally { setReading(false); }
  };
  return <section className="scanner"><div className="scanner-head"><SectionTitle number="1" title="新聞全体を1回撮る" note="紙面を真上から、明るい場所で撮ってください。"/><div className="file-buttons"><label><Camera size={18}/>カメラで撮る<input type="file" accept="image/*" capture="environment" onChange={(event) => load(event.target.files?.[0])}/></label><label className="sub"><ImagePlus size={18}/>画像を選ぶ<input type="file" accept="image/*" onChange={(event) => load(event.target.files?.[0])}/></label></div></div>{fileName && <div className="crop"><SectionTitle number="2" title="読みたい記事を囲む" note="記事を囲んだ後、実際の紙面に合わせて段数を選びます。"/><div className="stage-picker"><span>この記事は何段ですか？</span><div>{[1,2,3,4].map((count) => <button type="button" key={count} className={stageCount === count ? "active" : ""} onClick={() => setStageCount(count)}><b>{count}</b>段{count === 1 && <span>（横書きの記事）</span>}</button>)}</div><small>縦書きは、紙面が上下に分かれている数を選びます。</small></div><div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={(event) => { event.preventDefault(); const point = position(event); startRef.current = point; setBox({ x: point.x, y: point.y, w: 0, h: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!startRef.current) return; const point = position(event); setBox({ x: startRef.current.x, y: startRef.current.y, w: point.x - startRef.current.x, h: point.y - startRef.current.y }); }} onPointerUp={(event) => { startRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}/></div><div className="scan-actions"><button className="reset" onClick={() => { setBox(null); setMessage("もう一度、記事を囲んでください。"); }}><RotateCcw size={16}/>囲み直す</button><button className="primary" disabled={!box || Math.abs(box.w) < 30 || Math.abs(box.h) < 30 || reading} onClick={read}><ScanLine size={20}/>{reading ? stageCount + "段を読み取り中…" : stageCount + "段の記事を読み取る"}</button></div>{message && <p className={message.startsWith("エラー") ? "message error" : "message"}>{message}</p>}</div>}</section>;
}
