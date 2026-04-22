import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(express.json());

const LINE_TOKEN = "HEuVoiDoRD7zv2HEkMTfarcOe9WWz2UeTMWsoJ/mW86T7W1ilyu4VANUYwGb/+whQFSQw1YI+YaJXypc2zr3xhlGhNbc2WD+UOE4ALXxftot9ENIrXGCrgKS9BPlpkia+hNRnSmwyeeTAF+4W8N1lAdB04t89/1O/w1cDnyilFU=";
const DIFY_API = "app-HA2MtGjEj13YLYjnMR1rRVNt";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ■ 音声ファイル公開（超重要）
app.use(express.static("."));

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    // eventsが無い場合（検証対策）
    if (!events || events.length === 0) {
      return res.sendStatus(200);
    }

    const event = events[0];

    // messageが無い場合
    if (!event.message) {
      return res.sendStatus(200);
    }

    let userText = "";

    // =========================
    // ■ 音声メッセージ対応
    // =========================
    if (event.message.type === "audio") {
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
    // ■ テキストメッセージ対応
    // =========================
    else if (event.message.type === "text") {
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
    // ■ 音声生成（TTS）
    // =========================
    const ttsRes = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
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

    // =========================
    // ■ LINEに音声で返信
    // =========================
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: event.replyToken,
        messages: [
          {
            type: "audio",
            originalContentUrl:
              "https://line-voice-bot-2g4m.onrender.com/reply.mp3",
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
