import { Actor } from "apify";

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const { profileUrl = "https://www.linkedin.com/in/example/" } = input;

await Actor.pushData({
  message: "✅ Actor ran successfully",
  profileUrl,
  ranAt: new Date().toISOString()
});

await Actor.exit();
