const { Client, GatewayIntentBits } = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const { getClient } = require('./utils');
const { DISCORD_TOKEN } = require('./config');

const client = getClient();

//debug
client.on('debug', console.log);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Check if in voice channel on startup
  client.guilds.cache.forEach(guild => {
    const botMember = guild.members.cache.get(client.user.id);
    if (botMember && botMember.voice.channel) {
      console.log(`Bot is in voice channel ${botMember.voice.channel.name} in guild ${guild.name}`);
      joinVC(botMember.voice.channel).catch(console.error);
    }
  });
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