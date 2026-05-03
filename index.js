import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { google } from "googleapis";

const app = express();
app.use(express.json());

// =========================
// ■ 環境変数
// =========================
const LINE_TOKEN = process.env.LINE_TOKEN;
const DIFY_API = process.env.DIFY_API;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// =========================
// ■ Google認証
// =========================
const raw = JSON.parse(process.env.GOOGLE_CREDENTIALS);
raw.private_key = raw.private_key.replace(/\\n/g, "\n");

const auth = new google.auth.GoogleAuth({
  credentials: raw,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// =========================
// ■ 取得
// =========================
async function getMemory(userId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "memoryDB!A:D"
  });

  const rows = res.data.values || [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return {
        memory_summary: rows[i][1] || "",
        profile_text: rows[i][2] || "",
        conversation_id: rows[i][3] || ""
      };
    }
  }

  return null;
}

// =========================
// ■ memory保存
// =========================
async function saveMemory(userId, memory) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "memoryDB!A:D"
  });

  const rows = res.data.values || [];
  let found = false;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `memoryDB!A${i + 1}:D${i + 1}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[userId, memory.memory_summary, memory.profile_text, memory.conversation_id]]
        }
      });
      found = true;
      break;
    }
  }

  if (!found) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "memoryDB!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[userId, memory.memory_summary, memory.profile_text, memory.conversation_id]]
      }
    });
  }
}

// =========================
// ■ 静的ファイル
// =========================
app.use(express.static("."));

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) return res.sendStatus(200);

    const event = events[0];
    if (!event.message) return res.sendStatus(200);

    const userId = event.source.userId || "anonymous";

    let userText = "";
    let replyType = "text";

    // =========================
    // ■ 音声
    // =========================
    if (event.message.type === "audio") {
      replyType = "audio";

      const audio = await axios.get(
        `https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
        {
          headers: { Authorization: `Bearer ${LINE_TOKEN}` },
          responseType: "arraybuffer"
        }
      );

      fs.writeFileSync("audio.m4a", audio.data);

      const form = new FormData();
      form.append("file", fs.createReadStream("audio.m4a"));
      form.append("model", "whisper-1");

      const transcript = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${OPENAI_API_KEY}`
          }
        }
      );

      userText = transcript.data.text;
    }

    // =========================
    // ■ テキスト
    // =========================
    else if (event.message.type === "text") {
      userText = event.message.text;
    } else {
      return res.sendStatus(200);
    }

    // =========================
    // ■ memory取得
    // =========================
    let memory = await getMemory(userId);

    if (!memory) {
      memory = {
        memory_summary: "",
        profile_text: "",
        conversation_id: ""
      };
    }

    // =========================
    // ■ Dify送信
    // =========================
    const payload = {
      inputs: {
        memory_summary: memory.memory_summary,
        profile_text: memory.profile_text
      },
      query: userText,
      user: userId,
      response_mode: "blocking"
    };

    // 既存セッションがある場合のみ付与
    if (memory.conversation_id) {
      payload.conversation_id = memory.conversation_id;
    }

    const difyRes = await axios.post(
      "https://api.dify.ai/v1/chat-messages",
      payload,
      {
        headers: {
          Authorization: `Bearer ${DIFY_API}`,
          "Content-Type": "application/json"
        }
      }
    );

const text =
  difyRes.data.answer || "すみません、うまくお答えできませんでした。";

// =========================
// ■ answer（会話部分）
// =========================
const answer =
  text.match(/answer:\s*([\s\S]*?)■profile_text■/)?.[1]?.trim()
  || text;

// =========================
// ■ profile（プロフィール）
// =========================
const profile_text =
  text.match(/■profile_text■([\s\S]*?)＝＝＝＝＝＝＝＝＝＝＝＝＝/)?.[0]?.trim()
  || "";

// =========================
// ■ memory（提案履歴）
// =========================
const memory_summary =
  text.match(/■memory_summary■([\s\S]*?)■profile_text■/)?.[0]?.trim()
  || "";
    
    // =========================
    // ■ ★ここが重要（DifyのID保存）
    // =========================
    if (difyRes.data.conversation_id) {
      memory.conversation_id = difyRes.data.conversation_id;
    }

    // =========================
    // ■ memory更新（Difyの出力を使う）
    // =========================
console.log("---- DEBUG ----");
console.log("answer:", answer);
console.log("memory_summary:", memory_summary);
console.log("profile_text:", profile_text);
console.log("userId:", userId);
console.log("sheet userId:", rows[i][0]);    
    
   if (memory_summary) {
      memory.memory_summary = memory_summary;
    }

    if (profile_text) {
      memory.profile_text = profile_text;
    }

    await saveMemory(userId, memory);

    // =========================
    // ■ 音声返信
    // =========================
    if (replyType === "audio") {
      const ttsRes = await axios.post(
        "https://api.openai.com/v1/audio/speech",
        {
          model: "gpt-4o-mini-tts",
          voice: "shimmer",
          input: answer
        },
        {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          responseType: "arraybuffer"
        }
      );

      fs.writeFileSync("reply.mp3", ttsRes.data);

      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: "audio",
              originalContentUrl: "https://line-voice-bot-2g4m.onrender.com/reply.mp3",
              duration: 5000
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // =========================
    // ■ テキスト返信
    // =========================
    else {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [{ type: "text", text: answer }]
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("エラー:", error.response?.data || error.message);
    return res.sendStatus(200);
  }
});

// =========================
// ■ 起動
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動: ${PORT}`);
});
