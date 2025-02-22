const { Client, GatewayIntentBits } = require('discord.js');

// initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
});

const getClient = () => client;

const getUsername = async (userId) => {
  const user = await client.users.fetch(userId);
  return user.username;
};

module.exports = { getClient, getUsername };