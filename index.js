import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ===== ImgBB direct links (Carousel images) =====
const IMG_A = "https://i.ibb.co/mV4pQy6k/C1.png";
const IMG_B = "https://i.ibb.co/XZ6wjxVt/C2.png";
const IMG_C = "https://i.ibb.co/jkBwYdxK/C3.png";

// ===== Duplicate хамгаалалт =====
// message/postback id давхар ирдэг тул 60 сек дотор дахин боловсруулдаггүй
const processedIds = new Set();
function isDuplicateAndMark(event) {
  const id = event?.message?.mid || event?.postback?.mid;
  if (!id) return false;
  if (processedIds.has(id)) return true;
  processedIds.add(id);
  setTimeout(() => processedIds.delete(id), 60_000);
  return false;
}

// ===== Өдөрт 1 удаа menu, өдөрт 1 удаа сануулга =====
const welcomedDay = new Map(); // senderId -> YYYY-MM-DD
const nudgedDay = new Map(); // senderId -> YYYY-MM-DD

// ===== Захиалга flow =====
const orderFlow = new Map(); // senderId -> { step, model, phone }

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function normalizePhone(text) {
  const digits = (text || "").replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 11 && digits.startsWith("976")) return digits.slice(3);
  return null;
}

// =========================
// VERIFY
// =========================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const entries = req.body.entry || [];

    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];

      for (const event of messagingEvents) {
        const senderId = event?.sender?.id;
        if (!senderId) continue;

        // ✅ duplicate event ignore
        if (isDuplicateAndMark(event)) continue;

        // ✅ bot өөрөө явуулсан echo ignore
        if (event.message?.is_echo) continue;

        const today = dayKey();

        // =========================
        // POSTBACK
        // =========================
        if (event.postback) {
          const p = event.postback.payload;

          if (p === "GET_STARTED") {
            await sendText(
              senderId,
              "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
            );
            await sendMainMenu(senderId);

            welcomedDay.set(senderId, today);
            nudgedDay.delete(senderId);
            continue;
          }

          // Камерны мэдээлэл -> Carousel зурагтай
          if (p === "CAMERA_INFO") {
            await sendModelCarousel(senderId);
            continue;
          }

          if (p === "MODEL_A") {
            await sendText(senderId, modelAText);
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

          // ORDER = "Хүргэлтээр авах" -> phone -> address
          if (p === "ORDER") {
            const prev = orderFlow.get(senderId);
            const model = prev?.model || null;
            orderFlow.set(senderId, { step: "await_phone", model });

            await sendText(
              senderId,
              "🚚 Хүргэлтээр авахын тулд холбоо барих дугаараа үлдээнэ үү.\nЖ: 88076051"
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

        // =========================
        // TEXT MESSAGE
        // =========================
        if (event.message?.text) {
          const textRaw = event.message.text.trim();

          // 1) order flow: phone
          const flow = orderFlow.get(senderId);

          if (flow?.step === "await_phone") {
            const phone = normalizePhone(textRaw);
            if (!phone) {
              await sendText(
                senderId,
                "📞 8 оронтой утасны дугаараа илгээнэ үү. Ж: 88076051"
              );
              continue;
            }
            flow.phone = phone;
            flow.step = "await_address";
            orderFlow.set(senderId, flow);

            await sendText(senderId, "📍 Хүргэлтийн хаягаа дэлгэрэнгүй бичнэ үү.");
            continue;
          }

          // 2) order flow: address
          if (flow?.step === "await_address") {
            const address = textRaw;
            const model = flow.model ? `${flow.model} загвар` : "Тодорхойгүй";
            const phone = flow.phone || "";

            await sendText(
              senderId,
              `✅ Хүргэлтийн хүсэлт авлаа!\n\n📦 Загвар: ${model}\n📞 Утас: ${phone}\n📍 Хаяг: ${address}`
            );

            await sendText(senderId, orderText);
            orderFlow.delete(senderId);
            continue;
          }

          // 3) normal: өдөрт 1 удаа welcome+menu
          const lastWelcome = welcomedDay.get(senderId);
          const canShowMenu = lastWelcome !== today;

          if (canShowMenu) {
            await sendText(
              senderId,
              "Сайн байна уу? BlackBox Garage MN 👋\nТа дараах сонголтуудаас сонгоно уу."
            );
            await sendMainMenu(senderId);

            welcomedDay.set(senderId, today);
            nudgedDay.delete(senderId);
            continue;
          }

          // 4) сануулга өдөрт 1 удаа л (spam биш)
          const lastNudge = nudgedDay.get(senderId);
          const canNudge = lastNudge !== today;

          if (canNudge) {
            await sendText(senderId, "Доорх товчнуудаас сонголтоо хийнэ үү ✅");
            nudgedDay.set(senderId, today);
          }
          // else: silent

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
            { type: "postback", title: "Холбоо барих", payload: "CONTACT" }
          ]
        }
      }
    }
  });
}

// Carousel A/B/C
async function sendModelCarousel(id) {
  return callSendAPI({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: "A загвар — 360,000₮",
              image_url: IMG_A,
              subtitle: "🎁 64GB Memory card + уншигч бэлэг",
              buttons: [
                { type: "postback", title: "A дэлгэрэнгүй", payload: "MODEL_A" },
                { type: "postback", title: "🚚 Хүргэлтээр авах", payload: "ORDER" }
              ]
            },
            {
              title: "B загвар — 160,000₮",
              image_url: IMG_B,
              subtitle: "🎁 64GB Memory card + уншигч бэлэг",
              buttons: [
                { type: "postback", title: "B дэлгэрэнгүй", payload: "MODEL_B" },
                { type: "postback", title: "🚚 Хүргэлтээр авах", payload: "ORDER" }
              ]
            },
            {
              title: "C загвар — 100,000₮",
              image_url: IMG_C,
              subtitle: "🎁 64GB Memory card + уншигч бэлэг",
              buttons: [
                { type: "postback", title: "C дэлгэрэнгүй", payload: "MODEL_C" },
                { type: "postback", title: "🚚 Хүргэлтээр авах", payload: "ORDER" }
              ]
            }
          ]
        }
      }
    }
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
            { type: "postback", title: "📞 Холбоо барих", payload: "CONTACT" }
          ]
        }
      }
    }
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

💰 Хэрэв 2-р хувилбараар (гал хамгаалагчид) хийлгэх бол 50,000₮ дуудлагын хөлс нэмэгдэнэ.

🏦 Данс: Хаан Bank — IBAN: 73000500 5876396044`;

const modelAText = `📷 A загвар камер
💰 Үнэ: 360,000₮
${giftText}

✔️ Бүх хэл дээрх програмуудыг дэмждэг
✔️ 4K 3840x2160P урд камер
✔️ Wi-Fi + GPS
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
✔️ Wi-Fi`;

const modelCText = `📷 C загвар камер
💰 Үнэ: 100,000₮
${giftText}

✔️ 1080P
✔️ G sensor
✔️ 24 цагийн хяналт
✔️ Wi-Fi + гар утасны апп
✔️ 120° харагдац`;

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🤖 Bot running on", PORT));