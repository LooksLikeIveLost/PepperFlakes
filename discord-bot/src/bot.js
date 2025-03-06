const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ApplicationCommandOptionType,
  WebhookClient,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { joinVC, leaveVC } = require('./voiceHandler');
const { generateBotResponse } = require('./textHandler');
const {
  tierMap,
  getClient,
  notifyUserTierChange,
  getUserTier
} = require('./utils');
const {
  generateVoicePreviews,
  createVoiceFromPreview,
  cloneVoice,
  deleteVoice,
  addToVoiceTempStorage,
  getFromVoiceTempStorage,
  deleteFromVoiceTempStorage
} = require('./elevenLabs');
const axios = require('axios');
const { DISCORD_TOKEN, DATABASE_MANAGER_URL, BOT_DEVELOPER_ID } = require('./config');

const {
  DEV_TIER,
  getUserBotCount,
  getBotConfig,
  getBotConfigsList,
  getBotConfigsByChannel,
  initializeBotConfig,
  deleteBotConfig,
  deleteBotConfigsByOwnerSever,
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
    name: 'help',
    description: 'Get help',
  },
  {
    name: 'tier',
    description: 'Get your tier',
  },
  {
    name: 'subscribe',
    description: 'Information on upgrading your tier',
  },
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
    name: 'setvoiceidfromdescription',
    description: 'Generate voice previews based on a description',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      },
      {
        name: 'description',
        type: ApplicationCommandOptionType.String,
        description: 'The voice description (20-1000 characters)',
        required: true,
      },
    ]
  },
  {
    name: 'setvoiceidfromvoiceclone',
    description: 'Clone a voice from an audio file',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The name of the bot',
        required: true,
      },
      {
        name: 'audiofile',
        type: ApplicationCommandOptionType.Attachment,
        description: 'The audio file to clone (MP3 or WAV, 10 seconds - 2 minutes)',
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
    console.error('Failed to reload application (/) commands:', error.response.data);
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
    console.error('Error sending webhook message:', error.response.data);
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
    console.error('Error checking server permissions:', error.response.data);
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
      case 'help': {
        // Send an embed with the steps to set up a bot
        const embed = new EmbedBuilder()
          .setTitle('Help')
          .setDescription('Here are a list of common commands to get you started:');

        embed.addFields({ name: '/create', value: 'Start by creating a bot with a given name.' });
        embed.addFields({ name: '/charactercard', value: 'Use this command to view a list of characters. Pass a name argument to see a specific card!' });
        embed.addFields({ name: '/updatebot', value: 'Use this command to update its character card.' });
        embed.addFields({ name: '/enablechannel', value: 'Allow the bot to post messages in a given channel. Bots will often respond to their name, or randomly as you chat.' });
        embed.addFields({ name: '/disablechannel', value: 'Disable a channel for a bot, making it no longer post messages.' });
        embed.addFields({ name: '/setvoiceid', value: 'Set the bot\'s Eleven Labs voice ID.' });
        embed.addFields({ name: '/joinvc', value: 'Join a voice channel and have the bot chime in!' });
        embed.addFields({ name: '/leavevc', value: 'Have the bot leave the voice channel.' });
        embed.addFields({ name: '/delete', value: 'Delete the bot.' });
        embed.addFields({ name: '/tier', value: 'Check your current tier!' });
        embed.addFields({ name: '/subscribe', value: 'Get more features and support the bot!' });
        embed.addFields({ name: 'Discord Server', value: 'https://discord.gg/FHtZznTjk6' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'tier': {
        // Get the user's tier
        const userTier = await getUserTier(ownerId);

        await interaction.reply({ content: `You are curently a ${userTier} tier member! Use the subscribe command for info about changing your tier! (If this seems like a mistake, get help through our server.)`, ephemeral: true });
        break;
      }

      case 'subscribe': {
        // Send an embed with the steps to for subscription
        const embed = new EmbedBuilder()
          .setTitle('Subscriptions')
          .setDescription('Here are ways you can support me and get more features:');
        
        embed.addFields({ name: 'Patreon', value: 'https://www.patreon.com/c/KylenXiao' });
        embed.addFields({ name: 'Discord', value: 'https://discord.com/discovery/applications/1342256163231760484/store' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

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
          // Get the user's tier
          const userTier = await getUserTier(ownerId);

          // Check if member limit is exceeded
          const guild = await client.guilds.fetch(serverId);
          const maxMembers = tierMap[userTier]["member-quota"];
          if (guild.memberCount > maxMembers && maxMembers > 0) {
            await interaction.editReply('Cannot add bot to server with more than ' + tierMap[userTier]["member-quota"] + ' members. Upgrade your tier to remove limits.');
            return;
          }

          // Check if quota is exceeded
          const response = await getUserBotCount(ownerId);
          if (response) {
            const userBotCount = response.bot_count;

            if (userTier != DEV_TIER && userBotCount >= tierMap[userTier]["bot-quota"]) {
              await interaction.editReply('You have reached the maximum number of servers with bots for your tier. Please upgrade or delete a current bot.');
              return;
            }
          }

          await initializeBotConfig(ownerId, serverId, name);
          await interaction.editReply(`Bot created successfully for server.`);
        } catch (error) {
          console.error('Error creating bot:', error.response.data);
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
          console.error('Error initializing bot:', error.response.data);
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

        // Get tier
        const userTier = await getUserTier(ownerId);

        // Get desc limit
        const descLimit = tierMap[userTier]["desc-limit"];

        // Limit characters
        if (value.length > descLimit) {
          await interaction.reply({ content: 'Value must be less than ' + descLimit + ' characters. Upgrade your tier to increase limits.', ephemeral: true });
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

        // Get owner's tier
        const ownerTier = await getUserTier(botConfig.user_id);
        const voiceAccess = tierMap[ownerTier]['voice-enabled'];

        if (!voiceAccess) {
          await interaction.reply('The owner of this character does not have access to voice functionality.');
          return;
        }
        
        try {
          await deleteVoice(botConfig.eleven_voice_id);
          await updateBotElevenVoiceId(serverId, name, voiceId, false);
          await interaction.reply({ content: 'Updated bot Eleven Labs Voice ID successfully.', ephemeral: true});
        } catch (error) {
          console.error('Error updating bot ElevenVoice ID:', error.response.data);
          await interaction.reply({ content: 'Failed to update bot Eleven Labs Voice ID. Check the console for more details.', ephemeral: true});
          return;
        }
        break;
      }

      case 'setvoiceidfromdescription': {
        name = options.getString('name');
        description = options.getString('description');

        if (description.length > 2000 || description.length < 20) {
          await interaction.reply({ content: 'Description must be between 20 and 2000 characters.', ephemeral: true });
          return;
        }

        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }

        const botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }

        // Get owner's tier
        const ownerTier = await getUserTier(botConfig.user_id);
        const customVoices = tierMap[ownerTier]['custom-voice'];

        if (!customVoices) {
          await interaction.reply({ content: 'The owner of this character does not have access to custom voices.', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
          const text = "Hello, my name is " + name + ". Here is my description: " + description.slice(0, 100) + ". Will you choose this as my new voice? I really hope so.";
          const previews = await generateVoicePreviews(description, text);
          if (!previews) {
            await interaction.editReply({ content: 'Failed to generate voice previews. Please ensure prompts follow ElevenLabs guidelines.', ephemeral: true});
            return;
          }

          for (const preview of previews) {
            // Add to temp storage
            addToVoiceTempStorage(preview.generated_voice_id, {
              name: name,
              description: description,
              prev_eleven_voice_id: botConfig.eleven_voice_id
            });
          }

          const buttons = previews.map((preview, index) => 
            new ButtonBuilder()
              .setCustomId(`select_preview_${preview.generated_voice_id}`)
              .setLabel(`Preview ${index + 1}`)
              .setStyle(ButtonStyle.Primary)
          );

          const attachments = previews.map((preview, index) => {
            const buffer = Buffer.from(preview.audio_base_64, 'base64');
            return new AttachmentBuilder(buffer, { name: `preview_${index + 1}.mp3` });
          }).filter(attachment => attachment !== null);

          await interaction.editReply({
            content: 'Select a voice preview to use.',
            files: attachments,
            components: [new ActionRowBuilder().addComponents(buttons)]
          });

          // Buttons are handled in interaction handler
        } catch (error) {
          console.error('Error generating voice previews:', error.response.data);
          await interaction.editReply({ content: 'Failed to generate voice previews. Check the console for more details.', ephemeral: true});
          return;
        }
        break;
      }

      case 'setvoiceidfromvoiceclone': {
        const name = interaction.options.getString('name');
        const audioFile = interaction.options.getAttachment('audiofile');
      
        if (!audioFile || !audioFile.contentType.startsWith('audio/')) {
          await interaction.reply({ content: 'Please provide a valid audio file.', ephemeral: true });
          return;
        }

        // Check file type
        const allowedTypes = ['audio/mpeg', 'audio/wav'];
        if (!allowedTypes.includes(audioFile.contentType)) {
          await interaction.reply({ content: 'Please upload an MP3 or WAV file.', ephemeral: true });
          return;
        }

        // Check file size (2MB to 20MB)
        // const minSize = 2 * 1024 * 1024; // 2MB
        // const maxSize = 20 * 1024 * 1024; // 20MB
        // if (audioFile.size < minSize || audioFile.size > maxSize) {
        //   await interaction.reply({ content: 'Audio file must be between 2MB and 20MB.', ephemeral: true });
        //   return;
        // }
      
        const fileSizeInSeconds = audioFile.size / 16000; // Assuming 16kHz sample rate
        if (fileSizeInSeconds < 10 || fileSizeInSeconds > 120) {
          await interaction.reply({ content: 'Audio file must be between 10 seconds and 2 minutes long.', ephemeral: true });
          return;
        }
      
        if (!await hasPermissions(ownerId, serverId)) {
          await interaction.reply({ content: botPermissionsError, ephemeral: true });
          return;
        }
      
        const botConfig = await getBotConfigValidate(ownerId, serverId, name);
        if (!botConfig) {
          await interaction.reply({ content: botValidateError, ephemeral: true });
          return;
        }
      
        const ownerTier = await getUserTier(botConfig.user_id);
        const customVoice = tierMap[ownerTier]['custom-voice'];
      
        if (!customVoice) {
          await interaction.reply({ content: 'The owner of this character does not have access to custom voices.', ephemeral: true });
          return;
        }
      
        await interaction.deferReply({ ephemeral: true });
      
        try {
          await deleteVoice(botConfig.eleven_voice_id);

          const audioBuffer = await axios.get(audioFile.url, { responseType: 'arraybuffer' });
          const voiceId = await cloneVoice(name, audioBuffer.data);
      
          if (!voiceId) {
            await interaction.editReply({ content: 'Failed to clone voice.', ephemeral: true });
            return;
          }
      
          await updateBotElevenVoiceId(interaction.guildId, name, voiceId, true);
          await interaction.editReply(`Voice cloned successfully. New voice ID: ${voiceId}`);
        } catch (error) {
          console.error('Error cloning voice:', error.response.data);
          await interaction.editReply('An error occurred while cloning the voice.');
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
          await deleteVoice(botConfig.eleven_voice_id);
          await deleteBotConfig(serverId, name);
          await interaction.reply({ content: 'Bot deleted successfully.', ephemeral: true});

          // prune webhooks
          await pruneWebhooksServer(serverId);
        } catch (error) {
          console.error('Error deleting bot:', error.response.data);
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
          console.error('Error disabling bot:', error.response.data);
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

        // Leave voice channel
        await leaveVC(interaction.guild);

        // Get owner's tier
        const ownerTier = await getUserTier(botConfig.user_id);
        const voiceAccess = tierMap[ownerTier]['voice-enabled'];

        if (!voiceAccess) {
          await interaction.reply('The owner of this character does not have access to voice functionality.');
          return;
        }

        const customVoice = tierMap[ownerTier]['custom-voice'];
        if (!customVoice && botConfig.custom_voice) {
          await interaction.reply('The owner of this character does not have access to custom voices.');
          return;
        }

        // Set nickname
        try {
          const botMember = interaction.guild.members.cache.get(client.user.id);
          await botMember.setNickname(botConfig.name);
        } catch (error) {
          console.error('Error setting nickname:', error.response.data);
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
          console.error('Error resetting nickname:', error.response.data);
        }

        await leaveVC(interaction.guild);
        await interaction.reply({ content: 'Left the voice channel.', ephemeral: true });
        break;
      }

      default: {
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      }
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
  }
});

// Handle button interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('select_preview_')) {
    const previewId = interaction.customId.split('_')[2];
    const data = getFromVoiceTempStorage(previewId);

    if (!data) {
      await interaction.reply({ content: 'Request timed out. Please try again.', ephemeral: true });
      return;
    }

    const name = data.name;
    const description = data.description;
    const prev_eleven_voice_id = data.prev_eleven_voice_id;

    deleteFromVoiceTempStorage(previewId);

    try {
      await deleteVoice(prev_eleven_voice_id);

      const voiceId = await createVoiceFromPreview(name, description, previewId);
      if (!voiceId) {
        await interaction.reply({ content: 'Failed to create voice from preview.', ephemeral: true });
        return;
      }

      await updateBotElevenVoiceId(interaction.guildId, name, voiceId, true);
      await interaction.reply({ content: `Voice created successfully. New voice ID: ${voiceId}`, ephemeral: true });
    } catch (error) {
      console.error('Error creating voice from preview:', error.response.data);
      await interaction.reply({ content: 'An error occurred while creating the voice.', ephemeral: true });
    }
  }
});

// Handle messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.webhookId) return;

  const serverId = message.guild ? message.guild.id : null;
  
  try {
    const botConfigs = await getBotConfigsByChannel(serverId, message.channel.id);

    console.log('Bot configs:', botConfigs);

    if (!botConfigs || botConfigs.length === 0) {
      return;
    }

    // Filter bots out if the member count isnt allowed by their tier
    let deleted = false;
    for (const botConfig of botConfigs) {
      const tier = await getUserTier(botConfig.user_id);
      const memberCount = message.guild.memberCount;

      if (memberCount > tierMap[tier]['member-quota']) {
        await deleteVoice(botConfig.eleven_voice_id);
        await deleteBotConfig(serverId, botConfig.name);
        deleted = true;
      }
    }
    if (deleted) {
      // Prune webhooks and voices
      await pruneWebhooksServer(serverId);
    }

    const contextSize = tierMap[tier]['context-size'];
    const time = tierMap[tier]['response-time'];

    const result = await generateBotResponse(client, message, contextSize, time, botConfigs);

    if (!result) {
      return;
    }

    const [response, botConfig] = result;

    if (botConfig.webhook_url) {
      await sendWebhookMessage(botConfig.webhook_url, response, botConfig.name, botConfig.profile_picture_url);
    }
  } catch (error) {
    console.error('Error handling message:', error.response.data);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
    const discordId = newMember.id;
    const newTier = await getUserTier(discordId);
    
    // Notify user
    await notifyUserTierChange(discordId, newTier);
  }
});

// Delete data when kicked
client.on('guildMemberRemove', async (member) => {
  if (member.id !== client.user.id) {
    const response = await deleteBotConfigsByOwnerSever(member.id, member.guild.id);
    for (const botConfig of response) {
      await deleteVoice(botConfig.eleven_voice_id);
    }
    await pruneWebhooksServer(member.guild.id);
  } else {
    const response = await deleteServerConfigs(member.guild.id);
    for (const botConfig of response) {
      await deleteVoice(botConfig.eleven_voice_id);
    }
    await deleteAllWebhooksForServer(member.guild.id);
  }
});

// Delete bot when server is deleted
client.on('guildDelete', async (guild) => {
  const response = await deleteServerConfigs(guild.id);
  for (const botConfig of response) {
    await deleteVoice(botConfig.eleven_voice_id);
  }
  await deleteAllWebhooksForServer(guild.id);
});

client.login(DISCORD_TOKEN);