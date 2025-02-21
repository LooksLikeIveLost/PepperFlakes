const axios = require('axios');
const { LANGUAGE_MODEL_URL } = require('./config');

async function generateBotResponse(client, message) {
  const messages = await message.channel.messages.fetch({ limit: 7 });

  // Filter by messages in the last hour and format
  const recentMessages = Array.from(messages.values())
    .filter(msg => msg.createdTimestamp > Date.now() - (60 * 60 * 1000))
    .reverse();

  // Convert to { role, author, content}
  const conversationHistory = recentMessages.map(msg => ({
    role: msg.author.id === client.user.id ? 'assistant' : 'user',
    name: msg.author.username,
    content: msg.content
  }))
  // Check for not now
  if (recentMessages.some(msg => msg.content.toLowerCase().includes('not now')
    || msg.content.toLowerCase().includes('shut up')
    || msg.content.toLowerCase().includes('be quiet'))) {
    return;
  }

  // Get chance of response, with 100% if message mentions bot and 15% for each message where the author is the bot, plus 2% flat
  const mentionsBot = message.mentions.users.has(client.user.id);
  const numOwnMessages = recentMessages.filter(msg => msg.author.id === client.user.id).length;

  // Get chance of response
  const chanceOfResponse = mentionsBot ? 100 : (15 * numOwnMessages + 2);
  const randomNum = Math.floor(Math.random() * 100);
  if (randomNum >= chanceOfResponse) {
    return;
  }

  // Signal typing status
  await message.channel.sendTyping();

  try {
    // Get response and send
    const response = await axios.post(LANGUAGE_MODEL_URL + '/generate', { messages: conversationHistory });
    if (response.data.reply) {
      await message.reply(response.data.reply);
    }
  } catch (error) {
    console.error("Error fetching AI response:", error);
  }
}

module.exports = { generateBotResponse };