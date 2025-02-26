const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ApplicationCommandOptionType,
  WebhookClient,
  EmbedBuilder,
  InteractionResponseFlags  
} = require('discord.js');
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
  getBotConfigsList,
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
  deleteBotWebhookLink,
  updateBotElevenVoiceId
} = require('./dbutils');

const client = getClient();

const botValidateError = "The bot does not exist or you do not own it.";
const botPermissionsError = "You do not have bot permissions in this server.";

const commands = [
  {
    name: 'create',
    description: 'Create a new bot',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: false,
      },
    ]
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
    name: 'setvoiceid',
    description: 'Set the elevenlabs voice ID for a bot',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      },
      {
        name: 'elevenlabsvoiceid',
        type: ApplicationCommandOptionType.String,
        description: 'The ElevenLabs voice ID',
        required: true,
      },
    ]
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

async function refreshAppCommands(guildId) {
  try {
    if (guildId) {
      // Update commands for a specific guild
      await rest.put(
        Routes.applicationGuildCommands(client.application.id, guildId),
        { body: commands }
      );
      console.log(`Successfully reloaded application (/) commands for guild ${guildId}.`);
    } else {
      // Update global commands
      await rest.put(
        Routes.applicationCommands(client.application.id),
        { body: commands }
      );
      console.log('Successfully reloaded global application (/) commands.');
    }
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
      { name: 'Eleven Labs Voice ID', value: botConfig.eleven_voice_id }
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
  if (!botConfig) {
    return null;
  }

  console.log('Bot config:', botConfig);

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

  try {
    let name = null;
    switch (commandName) {
      case 'charactercard': {
        name = options.getString('name');

        // Get list of characters
        if (!name) {
          await interaction.deferReply({ ephemeral: true });
          const botConfigs = await getBotConfigsList(ownerId, serverId);
          if (!botConfigs) {
            await interaction.editReply({ content: 'Failed to retrieve any bots.', ephemeral: true });
            return;
          }
          // Display list of character names
          const embed = new EmbedBuilder()
            .setTitle('Character Cards')
            .setDescription('Characters you own in this server:');
          for (let i = 0; i < botConfigs.length; i++) {
            const botConfig = botConfigs[i];
            embed.addFields({ name: botConfig.name, value: '' });
          }
          await interaction.editReply({ embeds: [embed], ephemeral: true });
          return;
        } else {
          // Get bot config
          const botConfig = await getBotConfigValidate(ownerId, serverId, name);
          if (!botConfig) {
            await interaction.reply({ content: botValidateError, ephemeral: true });
            return;
          }

          // Display character card
          const embed = await formatCharacterCard(botConfig);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }

      case 'create': {
        name = options.getString('name') || 'Pepper Flakes';

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Check if quota is exceeded
          const response = await getUserBotCount(ownerId);
          if (response) {
            const userTier = response.tier;
            const userBotCount = response.bot_count;

            if (userTier != DEV_TIER && userBotCount >= tierMap[userTier]["bot-quota"]) {
              await interaction.editReply('You have reached the maximum number of servers with bots for your tier. Please upgrade or delete a current bot.');
              return;
            }
          }

          await initializeBotConfig(ownerId, serverId, name);
          await interaction.editReply(`Bot created successfully for server.`);
        } catch (error) {
          console.error('Error creating bot:', error);
          await interaction.editReply("Failed to create bot named " + name + "... Check that the name is not already in use.");
        }
        break;
      }

      case 'enablechannel': {
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
          const existingConfig = await getBotConfigValidate(ownerId, serverId, name);
          if (!existingConfig) {
            await interaction.editReply(botValidateError);
            return;
          }
          
          // Get webhook
          const webhook = await getWebhook(serverId, channel);

          // Create link
          await createBotWebhookLink(existingConfig.id, webhook.id);

          await interaction.editReply(`Bot enabled successfully for channel ${channel.name}.`);
        } catch (error) {
          console.error('Error initializing bot:', error);
          await interaction.editReply('Failed to enable bot for channel. Check the console for more details.');
        }
        break;
      }

      case 'refreshcommands': {
        await interaction.deferReply({ ephemeral: true });
        const success = await refreshAppCommands(serverId);
        if (success) {
          await interaction.editReply('Application commands refreshed successfully.');
        } else {
          await interaction.editReply('Failed to refresh application commands. Check the console for more details.');
        }
        break;
      }

      case 'updatebot': {
        name = options.getString('name');

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply(botPermissionsError);
          return;
        }

        const field = options.getString('field');
        const value = options.getString('value');

        // Limit to 2000 characters
        if (value.length > 2000) {
          await interaction.reply({ content: 'Value must be less than 300 characters.', ephemeral: true });
          return;
        }

        const botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }
        
        botConfig[field] = value;

        const newConfig = {
          name: botConfig.name,
          character_description: botConfig.character_description,
          example_speech: botConfig.example_speech,
          profile_picture_url: botConfig.profile_picture_url
        }

        await axios.put(`${DATABASE_MANAGER_URL}/bot-config/${serverId}/${name}`, newConfig);
        await interaction.reply({ content: `Updated ${field} successfully.`, ephemeral: true});
        break;
      }

      case 'setvoiceid': {
        name = options.getString('name');
        voiceId = options.getString('elevenlabsvoiceid');

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        const botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }
        
        try {
          await updateBotElevenVoiceId(serverId, name, voiceId);
          await interaction.reply({ content: 'Updated bot Eleven Labs Voice ID successfully.', ephemeral: true});
        } catch (error) {
          console.error('Error updating bot ElevenVoice ID:', error);
          await interaction.reply({ content: 'Failed to update bot Eleven Labs Voice ID. Check the console for more details.', ephemeral: true});
          return;
        }
        break;
      }

      case 'delete': {
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

        try {
          await deleteBotConfig(serverId, name);
          await interaction.reply({ content: 'Bot deleted successfully.', ephemeral: true});

          // prune webhooks
          await pruneWebhooksServer(serverId);
        } catch (error) {
          console.error('Error deleting bot:', error);
          await interaction.reply('Failed to delete bot. Check the console for more details.');
        }
        break;
      }

      case 'disablechannel': {
        name = options.getString('name');
        
        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          // Check if bot exists
          const existingConfig = await getBotConfigValidate(ownerId, serverId, name);
          if (!existingConfig) {
            await interaction.editReply(botValidateError);
            return;
          }
          
          // Get webhook
          const webhook = await getWebhook(serverId, interaction.channel, false);
          if (!webhook) {
            await interaction.editReply('Bot is not enabled for this channel.');
            return;
          }

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
      }

      case 'joinvc': {
        name = options.getString('name');

        // Check if in a server
        if (!interaction.guild) {
          await interaction.reply('You need to be in a server to use this command.');
          return;
        }

        const botConfig = await getBotConfig(serverId, name);

        if (!botConfig) {
          await interaction.reply('Character not found.');
          return;
        }

        // Set nickname
        try {
          const botMember = interaction.guild.members.cache.get(client.user.id);
          await botMember.setNickname(botConfig.name);
        } catch (error) {
          console.error('Error setting nickname:', error);
        }

        await interaction.reply({ content: 'Joining the voice channel...', ephemeral: true });
        
        await joinVC(interaction.member.voice.channel, botConfig);
        break;
      }

      case 'leavevc': {
        // Reset nickname
        try {
          const botMember = interaction.guild.members.cache.get(client.user.id);
          await botMember.setNickname(null);
        } catch (error) {
          console.error('Error resetting nickname:', error);
        }

        await leaveVC(interaction.guild);
        await interaction.reply({ content: 'Left the voice channel.', ephemeral: true });
        break;
      }

      default: {
        await interaction.reply('Unknown command.');
      }
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

  const serverId = message.guild ? message.guild.id : null;
  
  // Check if the message mentions the bot
  try {
    const botConfigs = await getBotConfigsByChannel(serverId, message.channel.id);

    console.log('Bot configs:', botConfigs);

    if (!botConfigs || botConfigs.length === 0) {
      return;
    }

    const result = await generateBotResponse(client, message, botConfigs);

    if (!result) {
      return;
    }

    const [response, botConfig] = result;

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