const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, WebhookClient } = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const { getClient } = require('./utils');
const axios = require('axios');
const { DISCORD_TOKEN, DATABASE_MANAGER_URL, BOT_DEVELOPER_ID } = require('./config');

const {
  DEV_TIER,
  tierMap,
  getUserBotCount,
  getBotConfig,
  getBotConfigsByChannel,
  initializeBotConfig,
  deleteBotConfig,
  deleteBotConfigsByOwner,
  deleteServerConfigs,
  getWebhook,
  pruneWebhook,
  pruneWebhooksServer,
  deleteAllWebhooksForServer,
  createBotWebhookLink,
  deleteBotWebhookLink
} = require('./dbutils');

const client = getClient();

const botValidateError = "The bot does not exist or you do not own it.";
const botPermissionsError = "You do not have bot permissions in this server.";

const commands = [
  {
    name: 'create',
    description: 'Create a new bot',
  },
  {
    name: 'enablechannel',
    description: 'Enable a channel for a bot',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      },
    ]
  },
  {
    name: 'updatebot',
    description: 'Update bot configuration',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      },
      {
        name: 'field',
        type: ApplicationCommandOptionType.String,
        description: 'The field to update',
        required: true,
        choices: [
          { name: 'Name', value: 'name' },
          { name: 'Character Description', value: 'character_description' },
          { name: 'Example Speech', value: 'example_speech' },
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
    name: 'delete',
    description: 'Delete the bot',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      }
    ]
  },
  {
    name: 'disablechannel',
    description: 'Disable a channel for a bot',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      }
    ]
  },
  {
    name: 'charactercard',
    description: 'View the current character card',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot, or none for a list of character names',
        required: false,
      }
    ]
  },
  {
    name: 'joinvc',
    description: 'Join the voice channel',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the character to join the voice channel',
        required: true,
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
      // leave the voice channel
      leaveVC(guild);
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
    )

  return embed;
}

// Check if a given user has correct server permissions
async function hasPermissions(userId, serverId) {
  if (userId === BOT_DEVELOPER_ID) return true;
  // check if user is server owner
  const serverOwnerId = await client.guilds.fetch(serverId).then(guild => guild.ownerId);
  if (userId === serverOwnerId) return true;
  try {
    const guild = await client.guilds.fetch(serverId);
    const member = await guild.members.fetch(userId);
    return member.permissions.has('MANAGE_GUILD');
  } catch (error) {
    console.error('Error checking server permissions:', error);
    return false;
  }
}

async function getBotConfigValidate(ownerId, serverId, name) {
  // Get bot config
  botConfig = await getBotConfig(serverId, name);

  // Check if owner
  if (ownerId !== botConfig.owner_user_id && !hasPermissions(ownerId, serverId)) {
    return null;
  }

  return botConfig;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  const ownerId = interaction.user.id;
  const serverId = interaction.guild ? interaction.guild.id : null;

  if (!serverId) {
    await interaction.reply({ content: 'Commands can only be used in a server.', ephemeral: true });
    return;
  }

  let botConfig = null;
  let name = null;
  try {
    switch (commandName) {
      case 'charactercard':
        name = options.getString('name');

        // Get list of characters
        if (!name) {
          await interaction.deferReply({ ephemeral: true });
          const botConfigs = await getBotConfigs(ownerId, serverId);
          // Display list of character names
          const embed = new EmbedBuilder()
            .setTitle('Character Cards')
            .setDescription('Select a character to view their card.');
          for (let i = 0; i < botConfigs.length; i++) {
            const botConfig = botConfigs[i];
            embed.addFields({ name: botConfig.name, value: `${i + 1}` });
          }
          await interaction.editReply({ embeds: [embed] });
          return;
        } else {
          // Get bot config
          botConfig = await getBotConfigValidate(ownerId, serverId, name);
          if (!botConfig) {
            await interaction.reply({ content: botValidateError, ephemeral: true });
            return;
          }

          // Display character card
          const embed = await formatCharacterCard(botConfig);
          await interaction.reply({ embeds: [embed] });
          return;
        }
        break;

      case 'create':
        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Get existing bot config
          const existingConfig = getBotConfig(serverId, "Pepper Flakes");

          // Initialize bot config
          if (!existingConfig) {
            // Check if quota is exceeded
            const response = await getUserBotCount(ownerId);
            const userBotCountInfo = response.data;
            const userTier = userBotCountInfo.tier;
            const userBotCount = userBotCountInfo.bot_count;

            if (userTier != DEV_TIER && userBotCount >= tierMap[userTier]["bot-quota"]) {
              await interaction.editReply('You have reached the maximum number of servers with bots for your tier. Please upgrade or delete a current bot.');
              return;
            }

            const newBotConfig = await initializeBotConfig(ownerId, serverId);
            await axios.post(`${DATABASE_MANAGER_URL}/bot-config`, newBotConfig);
          } else {
            await interaction.editReply('Bot with same name already exists for this server.');
          }

          await interaction.editReply(`Bot created successfully for server.`);
        } catch (error) {
          console.error('Error creating bot:', error);
          await interaction.editReply('Failed to create bot. Check the console for more details.');
        }
        break;

      case 'enablechannel':
        name = options.getString('name');

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.reply({ content: 'Please send command in a text channel.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Check if bot exists
          const existingConfig = getBotConfigValidate(ownerId, serverId, name);
          if (!existingConfig) {
            await interaction.editReply(botValidateError);
            return;
          }
          
          // Get webhook
          const webhook = await getWebhook(ownerId, channel);

          // Create link
          await createBotWebhookLink(existingConfig.id, webhook.id);

          await interaction.editReply(`Bot enabled successfully for channel ${channel.name}.`);
        } catch (error) {
          console.error('Error initializing bot:', error);
          await interaction.editReply('Failed to enable bot for channel. Check the console for more details.');
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
        name = options.getString('name');

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply(botPermissionsError);
          return;
        }

        botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }
        const field = options.getString('field');
        const value = options.getString('value');
        botConfig[field] = value;

        await axios.put(`${DATABASE_MANAGER_URL}/bot-config/${serverId}/${name}`, botConfig);
        await interaction.reply(`Updated ${field} successfully.`);
        break;

      case 'deletebot':
        name = options.getString('name');

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }

        await deleteBotConfig(serverId, name);
        await interaction.reply('Bot deleted successfully.');
        break;

      case 'disablechannel':
        name = options.getString('name');
        
        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          // Check if bot exists
          const existingConfig = getBotConfigValidate(ownerId, serverId, name);
          if (!existingConfig) {
            await interaction.editReply(botValidateError);
            return;
          }
          
          // Get webhook
          const webhook = await getWebhook(ownerId, interaction.channel);

          // Delete link
          await deleteBotWebhookLink(existingConfig.id, webhook.id);

          await interaction.editReply(`Bot disabled successfully for channel ${interaction.channel.name}.`);

          // Prune webhook
          await pruneWebhook(serverId, interaction.channel.id);
        } catch (error) {
          console.error('Error disabling bot:', error);
          await interaction.editReply('Failed to disable bot for channel. Check the console for more details.');
        }
        break;

      case 'joinvc':
        name = options.getString('name');

        // Check if in a server
        if (!interaction.guild) {
          await interaction.reply('You need to be in a server to use this command.');
          return;
        }

        const characterName = options.getString('character_name');
        const botConfig = await getBotConfig(serverId, characterName);

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

// Delete data when kicked
client.on('guildMemberRemove', async (member) => {
  if (member.id !== client.user.id) {
    await deleteBotConfigsByOwner(member.id);
    await pruneWebhooksServer(member.guild.id);
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