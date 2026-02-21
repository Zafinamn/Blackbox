import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

await axios.post(
  `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
  {
    persistent_menu: [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: [
          { type: "postback", title: "Камерны мэдээлэл", payload: "CAMERA_INFO" },
          { type: "postback", title: "Захиалга өгөх", payload: "ORDER" },
          { type: "postback", title: "Холбоо барих", payload: "CONTACT" }
        ]
      }
    ]
  }
);

console.log("✅ BlackBox persistent menu set");