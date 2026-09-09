import { askOpenAI, errorResponse } from "@/lib/openai";

const grades = new Set(["小4", "小5", "小6", "中1", "中2", "中3"]);
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    points: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    words: {
      type: "array", minItems: 3, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        properties: { term: { type: "string" }, meaning: { type: "string" } },
        required: ["term", "meaning"],
      },
    },
    why: { type: "string" },
    relation: { type: "string" },
    quiz: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"],
      },
    },
  },
  required: ["title", "body", "points", "words", "why", "relation", "quiz"],
};

const gradeRules: Record<string, string> = {
  "小4": "小4までの漢字を中心にし、未習漢字には読みを添える。一文30〜35字を目安に、一文一情報で説明する。",
  "小5": "小5までの漢字を中心にし、原因と結果を明示する。一文35〜40字を目安にする。",
  "小6": "出来事・原因・結果・背景の関係を残す。一文40〜45字を目安にする。",
  "中1": "重要な社会用語を残して説明し、記事の要旨と段落関係が分かる形にする。",
  "中2": "新聞語彙を残し、論点・背景・因果関係・影響を整理する。",
  "中3": "原文を最大限維持し、長すぎる文と難語だけを補助して新聞原文への橋渡しにする。",
};

const sectionRules: Record<string, string> = {
  "小4": `すべての欄を小学4年生向けにする。
- points：各項目20〜30字ほど。「だれが・何をした・どうなる」を、やさしい一文で書く。抽象語だけでまとめない。
- words：5語。難しい言葉には読み方を付け、意味は小4が知っている言葉で一文にする。
- why：記事に書かれた理由を、短い文で具体的に説明する。
- relation：子どもの生活との関係が記事にある場合だけ、身近な言葉で説明する。
- quiz：記事の中に答えがそのまま書いてある質問を3問。「いつ」「だれ」「何をした」など、一問一内容にする。意見、要約、推論を求めない。`,
  "小5": `すべての欄を小学5年生向けにする。
- points：出来事・理由・結果を、各一文で具体的に書く。
- words：5語。読み方と、短く具体的な意味を示す。
- why：記事に書かれた原因を順番に説明する。
- relation：生活や地域との関係を具体的に説明する。
- quiz：記事から答えを見つけられる問題を中心にし、理由を問う問題は1問までにする。`,
  "小6": `すべての欄を小学6年生向けにする。
- points：出来事・原因・影響を区別してまとめる。
- words：4語。重要な社会用語を残して説明する。
- why：原因と結果のつながりを説明する。
- relation：地域や社会への影響を記事の範囲で説明する。
- quiz：事実確認2問と、原因・結果を確かめる問題1問にする。`,
  "中1": `すべての欄を中学1年生向けにする。
- points：記事の要旨、理由、影響を簡潔にまとめる。
- words：4語。社会で使われる用語を残して説明する。
- whyとrelation：記事の因果関係を整理する。
- quiz：要旨、事実、理由を確かめる3問にする。`,
  "中2": `すべての欄を中学2年生向けにする。
- points：論点・背景・影響が分かれるようにまとめる。
- words：3語。新聞語彙を保って説明する。
- whyとrelation：複数の因果関係や社会への影響を整理する。
- quiz：論点、根拠、影響を読み取る3問にする。`,
  "中3": `すべての欄を中学3年生向けにする。
- points：原文の論点・根拠・影響を正確にまとめる。
- words：3語。難しい新聞語彙だけを説明する。
- whyとrelation：事実と意見を分け、原文の論理を保つ。
- quiz：要旨、根拠、事実と意見の区別を問う3問にする。`,
};

export async function POST(request: Request) {
  try {
    const { text, grade } = await request.json() as { text?: string; grade?: string };
    if (!text?.trim() || text.length > 5_000 || !grade || !grades.has(grade)) {
      return Response.json({ error: "文章または学年の指定を確認してください。" }, { status: 400 });
    }

    const result = await askOpenAI([{
      role: "user",
      content: [{
        type: "input_text",
        text: `あなたは新聞記事の読解を支援する教育編集AIです。次の記事を${grade}向けに変換してください。

学年別ルール：${gradeRules[grade]}

各欄の学年別ルール：
${sectionRules[grade]}

絶対ルール：
- 事実、固有名詞、日時、人数、金額、割合、発言者を変えない。
- 原文にない理由・背景・評価・推測を追加しない。
- 重要なニュース用語は削除せず、wordsで説明する。
- whyやrelationが記事から分からない場合は「この記事だけでは詳しく分かりません。」とする。
- title、bodyだけでなく、points、words、why、relation、quizも指定学年に合わせる。
- pointsは大事なこと3点、quizは理解確認3問にする。
- quizは必ず記事の内容だけで答えられる問いにする。記事にない知識や難しい推測を求めない。
- quizの各項目はquestionとanswerの組にする。answerは記事本文から確認できる、指定学年に合った短い答えにする。
- 原文から答えを確認できない問題は作らない。

記事：
${text.trim()}`,
      }],
    }], schema) as { words: Array<{ term: string; meaning: string }> } & Record<string, unknown>;

    return Response.json({
      ...result,
      words: result.words.map(({ term, meaning }) => [term, meaning]),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
