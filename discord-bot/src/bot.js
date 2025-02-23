const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, WebhookClient } = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const { getClient } = require('./utils');
const axios = require('axios');
const { DISCORD_TOKEN, DATABASE_MANAGER_URL, BOT_DEVELOPER_ID } = require('./config');

const client = getClient();

const commands = [
  {
    name: 'initialize',
    description: 'Initialize or reset bot configuration for this server',
  },
  {
    name: 'updatebot',
    description: 'Update bot configuration',
    options: [
      {
        name: 'field',
        type: ApplicationCommandOptionType.String,
        description: 'The field to update',
        required: true,
        choices: [
          { name: 'Name', value: 'name' },
          { name: 'Character Description', value: 'character_description' },
          { name: 'Example Speech', value: 'example_speech' },
          { name: 'Voice Description', value: 'voice_description' },
          { name: 'ElevenLabs Voice ID', value: 'voice_id' },
          { name: 'Profile Picture URL', value: 'profile_picture_url' },
        ],
      },
      {
        name: 'value',
        type: ApplicationCommandOptionType.String,
        description: 'The new value for the field',
        required: true,
      },
    ],
  },
  {
    name: 'deregister',
    description: 'Deregister the bot',
  },
  {
    name: 'charactercard',
    description: 'View the current character card',
  },
  {
    name: 'joinvc',
    description: 'Join the voice channel',
  },
  {
    name: 'leavevc',
    description: 'Leave the voice channel',
  },
  {
    name: 'refreshcommands',
    description: 'Refresh commands',
  }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

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

async function refreshAppCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(client.application.id), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
    return true;
  } catch (error) {
    console.error('Failed to reload application (/) commands:', error);
    return false;
  }
}

async function getBotConfig(ownerId, serverId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bot config:', error);
    return null;
  }
}

async function initializeBotConfig(ownerId, serverId, channelId) {
  const newConfig = {
    // put as strings
    owner_id: ownerId.toString(),
    server_id: serverId.toString(),
    name: "Pepper Flakes",
    character_description: "A blank slate waiting to come to life. Has no memories and wants an identity. Monotone and introspective.",
    example_speech: "I don't know what riding a ferris wheel is like because I've never been to an amusement park before. Maybe you could ask something else.",
    voice_description: "",
    voice_id: "EXAVITQu4vr4xnSDxMaL",
    profile_picture_url: client.user.avatarURL(),
    webhook_id: "",
    webhook_url: "",
    channel_id: channelId.toString()
  };

  try {
    const response = await axios.post(`${DATABASE_MANAGER_URL}/bot-config`, newConfig);
    return response.data;
  } catch (error) {
    console.error('Error initializing bot config:', error);
    throw error;
  }
}

async function deleteBotConfig(ownerId, serverId) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting bot config:', error);
  }
}

async function createWebhook(channel) {
  try {
    console.log('Creating webhook for channel:', channel.id);
    const webhook = await channel.createWebhook({
      name: "Custom Bot Webhook",
      avatar: client.user.avatarURL(),
    });
    console.log('Webhook created:', webhook);
    return webhook;
  } catch (error) {
    console.error('Error creating webhook:', error);
    return null;
  }
}

async function sendWebhookMessage(webhookUrl, content, username, avatarURL) {
  const webhook = new WebhookClient({ url: webhookUrl });
  try {
    await webhook.send({
      content: content,
      username: username,
      avatarURL: avatarURL,
    });
  } catch (error) {
    console.error('Error sending webhook message:', error);
  }
}

async function formatCharacterCard(botConfig) {
  // Create an embed that displays all the character information
  const embed = new EmbedBuilder()
    .setTitle(botConfig.name)
    .setDescription(botConfig.character_description)
    .setThumbnail(botConfig.profile_picture_url)
    .addFields(
      { name: 'Example Speech', value: botConfig.example_speech },
      { name: 'Voice Description', value: botConfig.voice_description },
      { name: 'ElevenLabs Voice ID', value: botConfig.voice_id },
    )

  return embed;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  const ownerId = interaction.guild ? interaction.guild.ownerId : interaction.user.id;
  const serverId = interaction.guild ? interaction.guild.id : null;
  let botConfig = null;

  try {
    switch (commandName) {
      case 'charactercard':
        botConfig = await getBotConfig(ownerId, serverId);
        if (!botConfig) {
          await interaction.reply({ content: 'Bot is not initialized yet.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        const characterCard = await formatCharacterCard(botConfig);
        await interaction.editReply({ embeds: [characterCard] });
        break;

      case 'initialize':
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: 'Only the server owner can initialize the bot.', ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.reply({ content: 'Please send initialize command in a text channel.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Delete existing webhook if any
          const existingConfig = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`).catch(() => null);
          if (existingConfig && existingConfig.data.webhook_url) {
            const existingWebhook = new WebhookClient({ url: existingConfig.data.webhook_url });
            await existingWebhook.delete().catch(console.error);
          }

          // Create new webhook
          const webhook = await createWebhook(channel);
          const webhookId = webhook ? webhook.id : null;
          const webhookUrl = webhook ? webhook.url : null;
          if (!webhookUrl) {
            await interaction.editReply('Failed to create webhook. Please check bot permissions.');
            return;
          }

          // Initialize or update bot config
          const newBotConfig = await initializeBotConfig(ownerId, serverId, channel.id);
          newBotConfig.webhook_id = webhookId;
          newBotConfig.webhook_url = webhookUrl;
          await axios.post(`${DATABASE_MANAGER_URL}/bot-config`, newBotConfig);

          await interaction.editReply(`Bot initialized successfully in channel ${channel.name}.`);
        } catch (error) {
          console.error('Error initializing bot:', error);
          await interaction.editReply('Failed to initialize bot. Check the console for more details.');
        }
        break;

      case 'refreshcommands':
        if (interaction.user.id !== BOT_DEVELOPER_ID) {
          await interaction.reply({ content: 'Only the bot developer can use this command.', ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const success = await refreshAppCommands();
        if (success) {
          await interaction.editReply('Application commands refreshed successfully.');
        } else {
          await interaction.editReply('Failed to refresh application commands. Check the console for more details.');
        }
        break;

      case 'updatebot':
        botConfig = await getBotConfig(ownerId, serverId);
        if (!botConfig) {
          await interaction.reply('Please initialize the bot first.');
          return;
        }
        if (interaction.user.id !== ownerId) {
          await interaction.reply('Only the server owner can update the bot configuration.');
          return;
        }
        const field = options.getString('field');
        const value = options.getString('value');
        botConfig[field] = value;

        if (!botConfig.webhook_url && interaction.channel) {
          const webhook = await createWebhook(interaction.channel);
          botConfig.webhook_id = webhook.id;
          botConfig.webhook_url = webhook.url;
        }

        await axios.put(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`, botConfig);
        await interaction.reply(`Updated ${field} successfully.`);
        break;

      case 'deregister':
        if (interaction.user.id !== ownerId) {
          await interaction.reply('Only the server owner can deregister the bot.');
          return;
        }
        await deleteBotConfig(ownerId, serverId);
        await interaction.reply('Bot deregistered successfully.');
        break;

      case 'joinvc':
        // Check if in a server
        if (!interaction.guild) {
          await interaction.reply('You need to be in a server to use this command.');
          return;
        }
        
        await joinVC(interaction.member.voice.channel);
        await interaction.reply('Joined the voice channel.');
        break;

      case 'leavevc':
        await leaveVC(interaction.guild);
        await interaction.reply('Left the voice channel.');
        break;

      default:
        await interaction.reply('Unknown command.');
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await interaction.reply('An error occurred while processing the command.');
  }
});

// Handle messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.webhookId) return;

  const ownerId = message.guild ? message.guild.ownerId : message.author.id;
  const serverId = message.guild ? message.guild.id : null;
  
  // Check if the message mentions the bot
  try {
    const botConfig = await getBotConfig(ownerId, serverId);

    if (!botConfig || botConfig.channel_id !== message.channel.id) {
      return;
    }

    const response = await generateBotResponse(client, message, botConfig);

    if (botConfig.webhook_url) {
      await sendWebhookMessage(botConfig.webhook_url, response, botConfig.name, botConfig.profile_picture_url);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Delete bot when kicked
client.on('guildMemberRemove', async (member) => {
  if (member.id === client.user.id) {
    await deleteBotConfig(member.guild.ownerId, member.guild.id);
  }
});

client.login(DISCORD_TOKEN);