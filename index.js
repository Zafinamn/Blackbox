import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// senderId -> YYYY-MM-DD (ямар өдөр menu явуулсан)
const welcomedDay = new Map();

// senderId -> { step: "await_phone" | "await_address", model?: "A"|"B"|"C"|null, phone?: string }
const orderFlow = new Map();

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function normalizePhone(text) {
  // зөвхөн цифр үлдээнэ
  const digits = (text || "").replace(/\D/g, "");
  // Монголын нийтлэг 8 оронтой дугаар (эсвэл +976-тэй)
  if (digits.length === 8) return digits;
  if (digits.length === 11 && digits.startsWith("976")) return digits.slice(3);
  return null;
}

// VERIFY
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    const entries = req.body.entry || [];

    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];

      for (const event of messagingEvents) {
        const senderId = event?.sender?.id;
        if (!senderId) continue;

        const today = dayKey();

        // =========================
        // TEXT MESSAGE
        // =========================
        if (event.message?.text) {
          const textRaw = event.message.text.trim();

          // ✅ Хэрвээ хүргэлтийн мэдээлэл асууж байгаа (order flow) үед эхлээд түүнийг боловсруулна
          const flow = orderFlow.get(senderId);
          if (flow?.step === "await_phone") {
            const phone = normalizePhone(textRaw);
            if (!phone) {
              await sendText(senderId, "📞 Утасны дугаараа зөв форматтай (8 оронтой) илгээнэ үү. Ж: 88076051");
              continue;
            }
            flow.phone = phone;
            flow.step = "await_address";
            orderFlow.set(senderId, flow);

            await sendText(senderId, "📍 Хүргэлтийн хаягаа дэлгэрэнгүй бичнэ үү (дүүрэг/хороо/байр/орц/тоот гэх мэт).");
            continue;
          }

          if (flow?.step === "await_address") {
            const address = textRaw;
            const model = flow.model || null;
            const phone = flow.phone || "";

            // захиалга баталгаажуулах мэдээлэл
            await sendText(
              senderId,
              `✅ Хүргэлтийн хүсэлт авлаа!\n\n📦 Загвар: ${model ? model + " загвар" : "Тодорхойгүй (та загвараа сонгоод захиалж болно)"}\n📞 Утас: ${phone}\n📍 Хаяг: ${address}`
            );

            await sendText(senderId, orderText);

            // flow дуусгана
            orderFlow.delete(senderId);
            continue;
          }

          // ✅ Энгийн үед: ӨДӨРТ 1 УДАА Л menu
          const lastDay = welcomedDay.get(senderId);
          const canShow = lastDay !== today;

          if (canShow) {
            await sendText(
              senderId,
              "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
            );
            await sendMainMenu(senderId);
            welcomedDay.set(senderId, today);
          } else {
            await sendText(senderId, "Доорх товчнуудаас сонголтоо хийнэ үү ✅");
          }

          continue;
        }

        // =========================
        // POSTBACK
        // =========================
        if (event.postback) {
          const p = event.postback.payload;

          // Get Started — мөн өдөрт 1 удаа л welcome+menu
          if (p === "GET_STARTED") {
            const lastDay = welcomedDay.get(senderId);
            const canShow = lastDay !== today;

            if (canShow) {
              await sendText(
                senderId,
                "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
              );
              await sendMainMenu(senderId);
              welcomedDay.set(senderId, today);
            } else {
              await sendText(senderId, "Доорх товчнуудаас сонголтоо хийнэ үү ✅");
            }
            continue;
          }

          if (p === "CAMERA_INFO") {
            await sendCameraMenu(senderId);
            continue;
          }

          if (p === "MODEL_A") {
            await sendText(senderId, modelAText);
            // сүүлийн сонгосон загварыг хадгална
            orderFlow.set(senderId, { step: null, model: "A" });
            await orderButton(senderId);
            continue;
          }

          if (p === "MODEL_B") {
            await sendText(senderId, modelBText);
            orderFlow.set(senderId, { step: null, model: "B" });
            await orderButton(senderId);
            continue;
          }

          if (p === "MODEL_C") {
            await sendText(senderId, modelCText);
            orderFlow.set(senderId, { step: null, model: "C" });
            await orderButton(senderId);
            continue;
          }

          // ✅ ORDER = "Хүргэлтээр авах" — утас/хаяг асуух flow эхлүүлнэ
          if (p === "ORDER") {
            const prev = orderFlow.get(senderId);
            const model = prev?.model || null;
            orderFlow.set(senderId, { step: "await_phone", model });

            await sendText(
              senderId,
              `🚚 Хүргэлтээр авахын тулд холбоо барих дугаараа үлдээнэ үү.\nЖ: 88076051`
            );
            continue;
          }

          if (p === "CONTACT") {
            await sendText(senderId, "📞 Холбоо барих: 8807-6051");
            continue;
          }

          await sendText(senderId, "Танигдсангүй. Доорх товчнуудаас сонгоно уу ✅");
          continue;
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err?.message);
    return res.sendStatus(200);
  }
});

// =========================
// SEND FUNCTIONS
// =========================
async function callSendAPI(payload) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`,
      payload
    );
  } catch (err) {
    console.error("SendAPI error:", err?.response?.data || err?.message);
  }
}

async function sendText(id, text) {
  return callSendAPI({ recipient: { id }, message: { text } });
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
            { type: "postback", title: "🚚 Хүргэлтээр авах", payload: "ORDER" },
            { type: "postback", title: "Холбоо барих", payload: "CONTACT" },
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
            { type: "postback", title: "C загвар", payload: "MODEL_C" },
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
          text: "Хүргэлтээр авах уу?",
          buttons: [
            { type: "postback", title: "🚚 Хүргэлтээр авах", payload: "ORDER" },
            { type: "postback", title: "📞 Холбоо барих", payload: "CONTACT" },
          ],
        },
      },
    },
  });
}

// =========================
// TEXTS
// =========================
const giftText = "🎁 64GB Memory card + Memory card уншигч бэлэг";

const orderText = `🚚 Хүргэлт 24 цагийн дотор очно.

📦 2 төрлийн залгуур хамт очно:
1️⃣ Тамхины залгуурт залгах залгуур
2️⃣ Гал хамгаалагчид залгах залгуур

✔️ С камер зөвхөн тамхины залгуурт залгана.

💰 Хэрэв 2-р хувилбараар хийлгэх бол 30,000₮ дуудлагын хөлс нэмэгдэнэ.

🏦 Данс: Хаан Bank — IBAN: 73000500 5876396044`;

const modelAText = `📷 A загвар камер
💰 Үнэ: 360,000₮
${giftText}

✔️ Бүх хэл дээрх програмуудыг дэмждэг
✔️ 4K 3840x2160P урд камер
✔️ WiFi + GPS
✔️ G sensor + зогсоолын хяналт
✔️ OLED дэлгэц
✔️ Novatek 96670 процессор`;

const modelBText = `📷 B загвар камер
💰 Үнэ: 160,000₮
${giftText}

✔️ Full HD 1080P
✔️ Урд + ард камер
✔️ G sensor
✔️ Давталт бичлэг
✔️ 24 цагийн зогсоолын хяналт
✔️ WiFi`;

const modelCText = `📷 C загвар камер
💰 Үнэ: 100,000₮
${giftText}

✔️ 1080P
✔️ G sensor
✔️ WiFi
✔️ Гар утасны апп
✔️ 120° харагдац`;

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🤖 Bot running on", PORT));