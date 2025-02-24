const axios = require('axios');
const config = require('./config');

async function generateBotResponse(client, message, botConfigs) {
  const messages = await message.channel.messages.fetch({ limit: 7 });

  // Add probability of response to each bot config
  botConfigs.forEach(botConfig => {
    botConfig.probability = 0;
  });

  // Filter by messages in the last hour and format
  const recentMessages = Array.from(messages.values())
    .filter(msg => msg.createdTimestamp > Date.now() - (60 * 60 * 1000))
    .reverse();

  // Convert to { role, author, content}
  const conversationHistory = recentMessages.map(msg => ({
    role: (msg.webhookId || msg.author.id === client.user.id) ? 'assistant' : 'user',
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
  for (const botConfig of botConfigs) {
    const mentionsBot = message.mentions.users.has(client.user.id) || message.content.toLowerCase().includes(botConfig.name.toLowerCase());
    const numOwnMessages = recentMessages.filter(msg => msg.webhookId === botConfig.webhook_id).length;

    // Get chance of response
    botConfig.probability = mentionsBot ? 100 : (15 * numOwnMessages + 2);
  }

  // Get config with highest response probability (with randomness for ties)
  const botconfig = botConfigs.reduce((a, b) => (a.probability > b.probability) ? a : (a.probability < b.probability) ? b : Math.random() > 0.5 ? a : b);

  const randomNum = Math.floor(Math.random() * 100);
  if (randomNum >= botconfig.probability) {
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
  
  return [response, botconfig];
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