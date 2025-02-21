const { Client, GatewayIntentBits } = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const { DISCORD_TOKEN } = require('./config');

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

// Function to get username from user ID
const getUsername = async (userId) => {
  const user = await client.users.fetch(userId);
  return user.username;
};

//debug
client.on('debug', console.log);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Check if the message mentions the bot
  if (message.content.toLowerCase().includes('join vc')) {
    await joinVC(message.member.voice.channel);
  } else if (message.content.toLowerCase().includes('leave vc')) {
    leaveVC(message);
  } else {
    await generateBotResponse(client, message);
  }
});

client.login(DISCORD_TOKEN);

module.exports = { client, getUsername };