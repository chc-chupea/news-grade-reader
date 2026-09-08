import { askOpenAI, errorResponse } from "@/lib/openai";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    caption: { type: "string" },
    review: { type: "array", items: { type: "string" } },
    accepted: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["headline", "body", "caption", "review", "accepted", "confidence"],
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { imageDataUrl?: string; imageDataUrls?: string[]; readingMode?: "auto" | "headline" | "body" | "caption" | "article"; sameSource?: boolean };
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    if (images.length < 1 || images.length > 3 || images.some((image) => !image.startsWith("data:image/")) || images.reduce((sum, image) => sum + image.length, 0) > 8_000_000) {
      return Response.json({ error: "画像が大きすぎるか、画像形式が正しくありません。" }, { status: 400 });
    }

    const imageParts = images.map((image_url) => ({ type: "input_image", image_url, detail: "original" }));
    const readingMode = ["auto", "headline", "body", "caption", "article"].includes(body.readingMode || "") ? body.readingMode! : "auto";
    const modeInstructions = {
      auto: `赤枠内を紙面どおりに判定し、大・小見出しはheadline、記事本文はbody、写真説明はcaptionに入れてください。存在しない種類は空文字にしてください。`,
      headline: `赤枠内は見出しです。大見出し、小見出し、肩見出しを紙面の読み順でheadlineだけに入れてください。bodyとcaptionは必ず空文字にしてください。`,
      body: `赤枠内は記事本文です。見出しや写真説明を探さず、全文をbodyだけに入れてください。headlineとcaptionは必ず空文字にしてください。
画像のいちばん右にある縦列の最上部から最下部まで読み、次に左隣の縦列へ移り、左端まで繰り返してください。列を飛ばしたり、同じ列を二度読んだりしないでください。列の途中で文が終わっていなくても、次の列の上へそのままつなげてください。`,
      caption: `赤枠内は写真・図版の説明です。説明文をcaptionだけに入れてください。headlineとbodyは必ず空文字にしてください。縦書きなら右から左、横書きなら上から下へ読んでください。`,
      article: `赤枠内は1本の記事全体です。見出し、本文、写真・図版、罫線、段の切り替わりを先に把握してください。
見出しの位置は中央・右・左・途中のどこにある場合もあります。文字の大きさ、罫線、余白を根拠に、隣の記事を混ぜず、この1本の記事だけを読んでください。
本文は各ブロック内で右端の縦列を上から下へ読み、左隣の列へ進みます。段が下へ移る場合は、上の本文ブロックを読み終えてから下の本文ブロックへ進んでください。
大・小・肩見出しはheadline、本文はbody、写真説明はcaptionに入れてください。紙面の語順を保ち、要約・言い換え・補足は禁止です。`,
    } as const;
    const segmentInstruction = modeInstructions[readingMode];
    const transcriptionPrompt = `画像は、赤枠から切り出された日本語の縦書き新聞記事です。
${segmentInstruction}
${body.sameSource ? "画像1は元の切り抜き、画像2は同じ範囲の文字強調版です。別々の記事ではありません。必ず両方を照合してください。" : "複数画像の場合は画像1をすべて読んでから画像2へ進んでください。"}
各画像の中では、右上から下へ読み、次に左の列へ移ってください。
指定された赤枠の種類を厳守してください。
人名・地名・日時・金額・人数・割合は特に慎重に読み取ってください。
国名、組織名、カタカナの固有名詞は、文脈や一般知識で補わず、画像に見える文字だけを一文字ずつ転記してください。
例えば「フランス」を、文脈から「フィリピン」など別の国名へ置き換えてはいけません。
「検討」「決定」「予定」「開始」など、事実の強さを変える言葉にも注意してください。
読めない文字は推測せず「□」にしてください。
段落は改行で残し、紙面にない内容は絶対に追加しないでください。
reviewには、確認が必要な箇所を短く列挙してください。なければ空配列です。
元画像で文字を十分に確認できない、記事の境界や読み順を特定できない、または転記内容の大部分を画像上で裏付けられない場合は、文章を推測せずacceptedをfalse、confidenceをlowにしてください。
acceptedをtrueにできるのは、返す文章の各部分を画像上の文字で確認できた場合だけです。`;
    const readOnce = () => askOpenAI([{
      role: "user",
      content: [{ type: "input_text", text: transcriptionPrompt }, ...imageParts],
    }], schema);
    const [draftA, draftB] = await Promise.all([readOnce(), readOnce()]);
    const verified = await askOpenAI([{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `同じ新聞画像を、互いの答えを見せずに2回OCRした結果です。元画像を最終根拠として照合し、正しい転記を返してください。
2つの結果が異なる箇所は、必ず元画像の字形を一文字ずつ確認してください。文脈上もっともらしい語を選んではいけません。
特に国名、組織名、カタカナ、人名、地名、日時、金額、人数、割合、および「検討／決定」など意味を変える語を重点確認してください。
2つの結果で固有名詞や数値が異なった場合は、採用した表記にかかわらず、その箇所をreviewへ入れてください。
誤字、列や段の読み順、見出し・本文・写真説明の混同も直してください。
読み取り種類は「${readingMode}」です。${segmentInstruction}
画像で確認できない文字は推測せず「□」にし、その箇所をreviewへ入れてください。
画像にない説明や要約は加えず、新聞の本文をそのまま転記してください。
最終結果の文章を元画像上で再度追跡してください。画像に存在しない地名・人名・出来事・文章が一つでも混ざる場合はacceptedをfalseにしてください。
2案が大きく異なる場合や、紙面構造・読み順を確定できない場合もacceptedをfalse、confidenceをlowにしてください。無理に一つの文章を完成させてはいけません。

独立OCR結果A:
${JSON.stringify(draftA)}

独立OCR結果B:
${JSON.stringify(draftB)}`,
        },
        ...imageParts,
      ],
    }], schema);
    if (!verified.accepted || verified.confidence === "low") {
      return Response.json({ error: "画像から文章を十分に確認できませんでした。赤枠を記事の外側に合わせて、もう一度お試しください。" }, { status: 422 });
    }
    return Response.json(verified);
  } catch (error) {
    return errorResponse(error);
  }
}
