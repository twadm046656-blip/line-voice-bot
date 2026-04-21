import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = "HEuVoiDoRD7zv2HEkMTfarcOe9WWz2UeTMWsoJ/mW86T7W1ilyu4VANUYwGb/+whQFSQw1YI+YaJXypc2zr3xhlGhNbc2WD+UOE4ALXxftot9ENIrXGCrgKS9BPlpkia+hNRnSmwyeeTAF+4W8N1lAdB04t89/1O/w1cDnyilFU=";
const DIFY_API = "app-HA2MtGjEj13YLYjnMR1rRVNt";

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;

    // ■ eventsが無い場合（LINEの検証対策）
    if (!events || events.length === 0) {
      return res.sendStatus(200);
    }

    const event = events[0];

    // ■ messageが無いケース対策
    if (!event.message) {
      return res.sendStatus(200);
    }

    // ■ テキスト以外は無視（音声は後で追加）
    if (event.message.type !== "text") {
      return res.sendStatus(200);
    }

    const userText = event.message.text;

    // ■ Difyに送信
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

    const answer = difyRes.data.answer || "すみません、うまく答えられませんでした。";

    // ■ LINEに返信
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

    return res.sendStatus(200);

  } catch (error) {
    console.error("エラー内容:", error.response?.data || error.message);
    return res.sendStatus(200);
  }
});

// ■ Render用（ポート自動対応）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動: ${PORT}`);
});
