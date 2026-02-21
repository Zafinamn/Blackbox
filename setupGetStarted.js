import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

await axios.post(
  `https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
  { get_started: { payload: "GET_STARTED" } }
);

console.log("✅ Get Started set");
