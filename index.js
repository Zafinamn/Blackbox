import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const welcomed = new Map();

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const entries = req.body.entry || [];

    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];

      for (const event of messagingEvents) {
        const senderId = event?.sender?.id;
        if (!senderId) continue;

        // TEXT MESSAGE
        if (event.message?.text) {
          if (!welcomed.has(senderId)) {
            await sendText(
              senderId,
              "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
            );

            await sendMainMenu(senderId);

            const timeoutId = setTimeout(() => {
              welcomed.delete(senderId);
            }, 24 * 60 * 60 * 1000);

            welcomed.set(senderId, timeoutId);
          }
        }

        // POSTBACK
        if (event.postback) {
          const p = event.postback.payload; 
          if (p === "GET_STARTED") {
            await sendText(
              senderId,
              "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
            );
            await sendMainMenu(senderId);
            continue; // дараагийн event рүү (эсвэл return res.sendStatus(200) гэж болно)
          }

          if (p === "CAMERA_INFO") await sendCameraMenu(senderId);

          if (p === "MODEL_A") {
            await sendText(senderId, modelAText);
            await orderButton(senderId);
          }

          if (p === "MODEL_B") {
            await sendText(senderId, modelBText);
            await orderButton(senderId);
          }

          if (p === "MODEL_C") {
            await sendText(senderId, modelCText);
            await orderButton(senderId);
          }

          if (p === "ORDER") {
            await sendText(senderId, orderText);
          }

          if (p === "CONTACT") {
            await sendText(senderId, "📞 Холбоо барих: 8807-6051");
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(err);
    return res.sendStatus(200);
  }
});

// SEND FUNCTIONS
async function callSendAPI(payload) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`,
      payload
    );
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

async function sendText(id, text) {
  return callSendAPI({
    recipient: { id },
    message: { text },
  });
}

async function sendMainMenu(id) {
  return callSendAPI({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Үндсэн цэс 👇",
          buttons: [
            { type: "postback", title: "Камерны мэдээлэл", payload: "CAMERA_INFO" },
            { type: "postback", title: "Захиалга өгөх", payload: "ORDER" },
            { type: "postback", title: "Холбоо барих", payload: "CONTACT" }
          ],
        },
      },
    },
  });
}

async function sendCameraMenu(id) {
  return callSendAPI({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Аль загварын мэдээлэл авах вэ?",
          buttons: [
            { type: "postback", title: "A загвар", payload: "MODEL_A" },
            { type: "postback", title: "B загвар", payload: "MODEL_B" },
            { type: "postback", title: "C загвар", payload: "MODEL_C" }
          ],
        },
      },
    },
  });
}

async function orderButton(id) {
  return callSendAPI({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Захиалга өгөх бол доорх товчийг дарна уу 👇",
          buttons: [
            { type: "postback", title: "🛒 Шууд захиалах", payload: "ORDER" },
            { type: "postback", title: "📞 Холбоо барих", payload: "CONTACT" }
          ],
        },
      },
    },
  });
}

// TEXTS

const orderText =
`🚚 Хүргэлт 24 цагийн дотор очно.

📦 2 төрлийн залгуур хамт очно:
1️⃣ Тамхины залгуурт залгах залгуур
2️⃣ Гал хамгаалагчид залгах залгуур

✔️ С камер зөвхөн тамхины залгуурт залгана.

💰 Хэрэв 2-р хувилбараар хийлгэх бол 30,000₮ дуудлагын хөлс нэмэгдэнэ.

🏦 Данс: Хаан Bank — IBAN: 73000500 5876396044

✅ Захиалга баталгаажсаны дараа хүргэлт хийгдэнэ.`;

const modelAText =
`📷 A загвар камер

💰 Үнэ: 360,000₮

✔️ Бүх хэл дээрх програмуудыг дэмждэг
✔️ 4K 3840x2160P урд камер
✔️ WiFi + GPS
✔️ G sensor + зогсоолын хяналт
✔️ OLED дэлгэц
✔️ Novatek 96670 процессор`;

const modelBText =
`📷 B загвар камер

💰 Үнэ: 160,000₮

✔️ Full HD 1080P
✔️ Урд + ард камер
✔️ G sensor
✔️ Давталт бичлэг
✔️ 24 цагийн зогсоолын хяналт
✔️ WiFi`;

const modelCText =
`📷 C загвар камер

💰 Үнэ: 100,000₮

✔️ 1080P
✔️ G sensor
✔️ WiFi
✔️ Гар утасны апп
✔️ 120° харагдац`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🤖 Bot running on", PORT));