import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(express.json());

// ■ 環境変数（Renderで設定済みのものを使用）
const LINE_TOKEN = process.env.LINE_TOKEN;
const DIFY_API = process.env.DIFY_API;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ■ 音声ファイル公開（audio返信用）
app.use(express.static("."));

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    // ■ eventsなし（検証対策）
    if (!events || events.length === 0) {
      return res.sendStatus(200);
    }

    const event = events[0];

    // ■ messageなし対策
    if (!event.message) {
      return res.sendStatus(200);
    }

    let userText = "";
    let replyType = "text"; // デフォルト

    // =========================
    // ■ 音声メッセージ
    // =========================
    if (event.message.type === "audio") {
      replyType = "audio";

      const messageId = event.message.id;

      // LINEから音声取得
      const audio = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
          headers: { Authorization: `Bearer ${LINE_TOKEN}` },
          responseType: "arraybuffer"
        }
      );

      fs.writeFileSync("audio.m4a", audio.data);

      // Whisperで文字起こし
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
    // ■ テキストメッセージ
    // =========================
    else if (event.message.type === "text") {
      replyType = "text";
      userText = event.message.text;
    } else {
      return res.sendStatus(200);
    }

    // =========================
    // ■ Difyに送信
    // =========================
    const difyRes = await axios.post(
      "https://api.dify.ai/v1/chat-messages",
      {
        inputs: {},
        query: userText,
        user: event.source.userId || "anonymous"
      },
      {
        headers: {
          Authorization: `Bearer ${DIFY_API}`,
          "Content-Type": "application/json"
        }
      }
    );

    const answer =
      difyRes.data.answer || "すみません、うまくお答えできませんでした。";

    // =========================
    // ■ 音声で返す
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
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`
          },
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
    // ■ テキストで返す
    // =========================
    else {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: answer
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

    return res.sendStatus(200);

  } catch (error) {
    console.error("エラー内容:", error.response?.data || error.message);
    return res.sendStatus(200);
  }
});

// ■ Render用ポート
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動: ${PORT}`);
});
