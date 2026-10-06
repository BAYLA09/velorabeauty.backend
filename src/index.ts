import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.info(`velorabeauty-backend listening on port ${env.PORT}`);
});
