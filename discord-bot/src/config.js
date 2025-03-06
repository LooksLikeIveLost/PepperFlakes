require('dotenv').config();

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  BOT_DEVELOPER_ID: process.env.BOT_DEVELOPER_ID,
  MAIN_SERVER_ID: process.env.MAIN_SERVER_ID,
  LANGUAGE_MODEL_URL: process.env.LANGUAGE_MODEL_URL,
  AUDIO_PROCESSOR_URL: process.env.AUDIO_PROCESSOR_URL,
  DATABASE_MANAGER_URL: process.env.DATABASE_MANAGER_URL,
};

module.exports = config;