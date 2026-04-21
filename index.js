import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const LINE_TOKEN = "HEuVoiDoRD7zv2HEkMTfarcOe9WWz2UeTMWsoJ/mW86T7W1ilyu4VANUYwGb/+whQFSQw1YI+YaJXypc2zr3xhlGhNbc2WD+UOE4ALXxftot9ENIrXGCrgKS9BPlpkia+hNRnSmwyeeTAF+4W8N1lAdB04t89/1O/w1cDnyilFU=";
const DIFY_API = "app-HA2MtGjEj13YLYjnMR1rRVNt";

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
