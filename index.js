import express from "express";
import axios from "axios";
import { google } from "googleapis";

const app = express();
app.use(express.json());

// =========================
// ■ 環境変数
// =========================
const DIFY_API = process.env.DIFY_API;
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
// ■ memory取得
// =========================
async function getMemory(userId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "memoryDB!A:E"
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === userId);

  if (rowIndex === -1) return null;

  const row = rows[rowIndex];
  return {
    memory_summary:  row[1] || "",
    profile_text:    row[2] || "",
    suggest_summary: row[3] || "",
    conversation_id: row[4] || "",
    rowIndex
  };
}

// =========================
// ■ memory保存
// =========================
async function saveMemory(userId, memory) {
  const values = [[
    userId,
    memory.memory_summary,
    memory.profile_text,
    memory.suggest_summary,
    memory.conversation_id
  ]];

  if (memory.rowIndex) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `memoryDB!A${memory.rowIndex + 1}:E${memory.rowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: { values }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "memoryDB!A:E",
      valueInputOption: "RAW",
      requestBody: { values }
    });
  }
}

// =========================
// ■ チャットエンドポイント
// =========================
app.post("/chat", async (req, res) => {
  try {
    const { user_id, message } = req.body;

    if (!user_id || !message) {
      return res.status(400).json({ error: "user_id と message は必須です" });
    }

    // memory取得
    let memory = await getMemory(user_id) || {
      memory_summary:  "",
      profile_text:    "",
      suggest_summary: "",
      conversation_id: ""
    };

    // Dify送信
    const payload = {
      inputs: {
        memory_summary:  memory.memory_summary,
        profile_text:    memory.profile_text,
        suggest_summary: memory.suggest_summary,
        search_result:   ""
      },
      query: message,
      user: user_id,
      response_mode: "blocking"
    };

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

    const text = difyRes.data.answer || "";

    // answerパース
    const answer = (
      text.split("■memory_summary■")[0]
        .replace(/answer:\s*/, "")
        .trim()
    ) || text.trim();

    // memoryパース
    const memory_summary =
      text.match(/■memory_summary■([\s\S]*?)■profile_text■/)?.[1]?.trim() || "";

    const profile_text =
      text.match(/■profile_text■([\s\S]*?)■suggest_summary■/)?.[1]?.trim() || "";

    const suggest_summary =
      text.match(/■suggest_summary■([\s\S]*?)■FIN■/)?.[1]?.trim() || "";

    // memory更新・保存
    if (difyRes.data.conversation_id) {
      memory.conversation_id = difyRes.data.conversation_id;
    }
    if (memory_summary)  memory.memory_summary  = memory_summary;
    if (profile_text)    memory.profile_text    = profile_text;
    if (suggest_summary) memory.suggest_summary = suggest_summary;

    await saveMemory(user_id, memory);

    // JSONで返す
    return res.json({ answer });

  } catch (error) {
    console.error("エラー:", error.response?.data || error.message);
    return res.status(500).json({ error: "サーバーエラーが発生しました" });
  }
});

// =========================
// ■ 起動
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動: ${PORT}`);
});
