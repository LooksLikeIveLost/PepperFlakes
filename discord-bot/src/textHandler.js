const axios = require('axios');
const config = require('./config');

async function generateBotResponse(client, message, botconfig) {
  const messages = await message.channel.messages.fetch({ limit: 7 });

  // Filter by messages in the last hour and format
  const recentMessages = Array.from(messages.values())
    .filter(msg => msg.createdTimestamp > Date.now() - (60 * 60 * 1000))
    .reverse();

  // Convert to { role, author, content}
  const conversationHistory = recentMessages.map(msg => ({
    role: (msg.webhookId === botconfig.webhook_id || msg.author.id === client.user.id) ? 'assistant' : 'user',
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
  const numOwnMessages = recentMessages.filter(msg => msg.author.id === client.user.id || msg.webhookId === botconfig.webhook_id).length;

  // Get chance of response
  const chanceOfResponse = mentionsBot ? 100 : (15 * numOwnMessages + 2);
  const randomNum = Math.floor(Math.random() * 100);
  if (randomNum >= chanceOfResponse) {
    return;
  }

  // Wait 5-10 seconds
  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 5000) + 5000));

  // Signal typing status
  await message.channel.sendTyping();

  // Send response
  const response = await generateResponseFromMessages(conversationHistory, botconfig);

  // Stop typing status
  await message.channel.stopTyping();
  
  return response;
}

async function generateResponseFromMessages(messages, botconfig) {
  try {
    const response = await axios.post(config.LANGUAGE_MODEL_URL + '/generate', {
      messages: messages,
      botName: botconfig.name,
      characterDescription: botconfig.character_description,
      exampleSpeech: botconfig.example_speech
    });
    return response.data.reply;
  } catch (error) {
    console.error("Error fetching AI response:", error);
    return null;
  }
}

module.exports = { generateBotResponse, generateResponseFromMessages };