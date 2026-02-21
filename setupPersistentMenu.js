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
          { type: "postback", title: "Багцын үйлчилгээ", payload: "PACKAGE_SERVICE" },
          { type: "postback", title: "Хосын багц", payload: "COUPLE_PACKAGE" },
          { type: "postback", title: "Laundry", payload: "LAUNDRY" }
        ]
      }
    ]
  }
);

console.log("✅ Persistent menu set");
