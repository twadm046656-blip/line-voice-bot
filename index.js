import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = "ここにLINEトークン";
const DIFY_API = "ここにDify APIキー";

app.post("/webhook", async (req, res) => {
  const event = req.body.events[0];

  if (event.message.type === "text") {
    const userText = event.message.text;

    // Difyに送る
    const difyRes = await axios.post(
      "https://api.dify.ai/v1/chat-messages",
      {
        inputs: {},
        query: userText,
        user: event.source.userId
      },
      {
        headers: {
          Authorization: `Bearer ${DIFY_API}`,
          "Content-Type": "application/json"
        }
      }
    );

    const answer = difyRes.data.answer;

    // LINEに返す
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
          Authorization: `Bearer ${LINE_TOKEN}`
        }
      }
    );
  }

  res.sendStatus(200);
});

app.listen(3000);