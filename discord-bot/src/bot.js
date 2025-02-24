const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, WebhookClient } = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const { getClient } = require('./utils');
const axios = require('axios');
const { DISCORD_TOKEN, DATABASE_MANAGER_URL, BOT_DEVELOPER_ID } = require('./config');

const {
  DEV_TIER,
  tierMap,
  getUser,
  getUserBotCount,
  getBotConfig,
  getBotConfigsByChannel,
  getBotConfigByCharacterName,
  initializeBotConfig,
  deleteBotConfig,
  deleteServerConfigs,
  createWebhook,
  deleteWebhook,
  deleteAllWebhooks,
  deleteAllWebhooksForServer
} = require('./dbutils');

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
    options: [
      {
        name: 'charactername',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the character to join the voice channel',
        required: false,
      },
    ],
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

// Check if a given user has correct server permissions
async function hasServerPermissions(userId, serverId) {
  if (userId === BOT_DEVELOPER_ID) return true;
  try {
    const guild = await client.guilds.fetch(serverId);
    const member = await guild.members.fetch(userId);
    return member.permissions.has('MANAGE_GUILD');
  } catch (error) {
    console.error('Error checking server permissions:', error);
    return false;
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  const ownerId = interaction.user.id;
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
        if (!await hasServerPermissions(ownerId, serverId)) {
          await interaction.reply({ content: 'You do not have bot permissions.', ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.reply({ content: 'Please send initialize command in a text channel.', ephemeral: true });
          return;
        }

        // Add user to database if not exists
        await axios.post(`${DATABASE_MANAGER_URL}/user`, { user_id: ownerId });

        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Delete existing webhook if any
          const existingConfig = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`).catch(() => null);

          // Initialize bot config
          if (!existingConfig) {
            // Check if quota is exceeded
            const response = await getUserBotCount(ownerId);
            const userBotCountInfo = response.data;
            const userTier = userBotCountInfo.tier;
            const userBotCount = userBotCountInfo.bot_count;

            if (userTier != DEV_TIER && userBotCount >= tierMap[userTier]["bot-quota"]) {
              await interaction.editReply('You have reached the maximum number of servers with bots for your tier. Please upgrade or deregister a current bot.');
              return;
            }

            const newBotConfig = await initializeBotConfig(ownerId, serverId, channel.id);
            await axios.post(`${DATABASE_MANAGER_URL}/bot-config`, newBotConfig);
          }

          // Create new webhook
          const webhook = await createWebhook(ownerId, channel);
          if (!webhook) {
            await interaction.editReply('Failed to create webhook. Please check bot permissions.');
            return;
          }

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
        if (!await hasServerPermissions(ownerId, serverId)) {
          await interaction.reply('You do not have bot permissions.');
          return;
        }
        const field = options.getString('field');
        const value = options.getString('value');
        botConfig[field] = value;

        await axios.put(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`, botConfig);
        await interaction.reply(`Updated ${field} successfully.`);
        break;

      case 'deregister':
        await deleteWebhook(ownerId, serverId, interaction.channel.id);

        // Check if any webhooks exist
        const response = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/${ownerId}/${serverId}`).catch(() => null);
        if (!response || response.data.length === 0) {
          await deleteBotConfig(ownerId, serverId);
          await interaction.reply('Bot deregistered from channel and bot config deleted successfully.');
        } else {
          await interaction.reply('Bot deregistered from channel successfully. (Bot still active in other channels)');
        }
        break;

      case 'joinvc':
        // Check if in a server
        if (!interaction.guild) {
          await interaction.reply('You need to be in a server to use this command.');
          return;
        }

        const characterName = options.getString('character_name');
        let botConfig = null;
        if (!characterName) {
          // Get bot config by owner id
          botConfig = await getBotConfig(ownerId, serverId);
        } else {
          // Get bot config by character name
          botConfig = await getBotConfigByCharacterName(serverId, characterName);
        }

        if (!botConfig) {
          await interaction.reply('Character not found.');
          return;
        }
        
        await joinVC(interaction.member.voice.channel, botConfig);
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

  const ownerId = message.author.id;
  const serverId = message.guild ? message.guild.id : null;
  
  // Check if the message mentions the bot
  try {
    const botConfigs = await getBotConfigsByChannel(serverId, message.channel.id);

    if (!botConfigs) {
      return;
    }

    const [response, botConfig] = await generateBotResponse(client, message, botConfigs);

    if (botConfig.webhook_url) {
      await sendWebhookMessage(botConfig.webhook_url, response, botConfig.name, botConfig.profile_picture_url);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Delete bot when kicked
client.on('guildMemberRemove', async (member) => {
  if (member.id !== client.user.id) {
    await deleteBotConfig(member.guild.ownerId, member.guild.id);
    await deleteAllWebhooks(member.guild.ownerId, member.guild.id);
  } else {
    await deleteServerConfigs(member.guild.id);
    await deleteAllWebhooksForServer(member.guild.id);
  }
});

// Delete bot when server is deleted
client.on('guildDelete', async (guild) => {
  await deleteServerConfigs(guild.id);
  await deleteAllWebhooksForServer(guild.id);
});

client.login(DISCORD_TOKEN);