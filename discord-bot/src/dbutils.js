const axios = require('axios');
const { DATABASE_MANAGER_URL } = require('./config');
const { getClient } = require('./utils');
const client = getClient();

async function getUserBotCount(userId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/user/${userId}/bot-count`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user bot count:', error);
    return null;
  }
}

async function getBotConfig(serverId, name) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/${serverId}/${name}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bot config:', error);
    return null;
  }
}

async function getBotConfigsList(ownerId, serverId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/list/${ownerId}/${serverId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user bot configs:', error);
    return null;
  }
}

async function getBotConfigsByChannel(serverId, channelId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/channel/${serverId}/${channelId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bot configs by channel:', error);
    return null;
  }
}

async function initializeBotConfig(ownerId, serverId, name) {
  const newConfig = {
    // put as strings
    owner_id: ownerId.toString(),
    server_id: serverId.toString(),
    name: name,
    character_description: "A blank slate waiting to come to life. Has no memories and wants an identity. Monotone and introspective.",
    example_speech: "I don't know what riding a ferris wheel is like because I've never been to an amusement park before. Maybe you could ask something else.",
    eleven_voice_id: "EXAVITQu4vr4xnSDxMaL",
    profile_picture_url: client.user.avatarURL()
  };

  try {
    const response = await axios.post(`${DATABASE_MANAGER_URL}/bot-config`, newConfig);
    return response.data;
  } catch (error) {
    console.error('Error initializing bot config:', error);
    throw error;
  }
}

async function deleteBotConfig(serverId, name) {
  try {
    // Delete bot config
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-config/${serverId}/${name}`);

    return response.data;
  } catch (error) {
    console.error('Error deleting configs:', error);
  }
}

async function deleteBotConfigsByOwnerSever(ownerId, serverId) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-config/owner/server/${ownerId}/${serverId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting bot configs by owner:', error);
  }
}

async function deleteServerConfigs(serverId) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-config/server/${serverId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting server configs:', error);
  }
}

async function getWebhook(serverId, channel, create = true) {
  try {
    console.log('Creating webhook for channel:', channel.id);

    // Check if webhook exists (from database)
    try {
      const response = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/${serverId}/${channel.id}`);

      console.log('Webhook exists:', response.data);

      // Check if webhook with id exists
      const webhook = await client.fetchWebhook(response.data.webhook_id);

      if (!webhook) {
        // Webhook doesn't exist, attempt to create it
        const webhook = await channel.createWebhook({
          name: "Custom Bot Webhook",
          avatar: client.user.avatarURL(),
        });

        // Send to database
        const webhookData = {
          server_id: channel.guild.id,
          channel_id: channel.id,
          webhook_id: webhook.id,
          webhook_url: webhook.url
        }

        const response = await axios.put(`${DATABASE_MANAGER_URL}/webhook-config/update`, webhookData);
      }

      return response.data;
    } catch (error) {
      if (!create) {
        return null;
      }

      // Webhook doesn't exist, attempt to create it
      const webhook = await channel.createWebhook({
        name: "Custom Bot Webhook",
        avatar: client.user.avatarURL(),
      });
  
      // Send to database
      const webhookData = {
        server_id: channel.guild.id,
        channel_id: channel.id,
        webhook_id: webhook.id,
        webhook_url: webhook.url
      }
  
      const response = await axios.post(`${DATABASE_MANAGER_URL}/webhook-config`, webhookData);
  
      console.log('Webhook created:', response.data);
      return response.data;
    }
  } catch (error) {
    console.error('Error creating webhook:', error);
    return null;
  }
}

async function pruneWebhook(server_id, channel_id) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/webhook-config/prune/${server_id}/${channel_id}`);

    console.log('Webhook prune response:', response.data);

    if (response.data.deleted && response.data.webhook_id) {
      const webhook = await client.fetchWebhook(response.data.webhook_id);
      await webhook.delete();
    }

    return response.data;
  } catch (error) {
    console.error('Error pruning webhook:', error);
    return null;
  }
}

async function pruneWebhooksServer(server_id) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/webhook-config/prune-server/${server_id}`);

    console.log('Server webhook prune response:', response.data);
    
    if (response.data.deleted && response.data.webhook_ids.length > 0) {
      for (const webhook_id of response.data.webhook_ids) {
        try {
          const webhook = await client.fetchWebhook(webhook_id);
          await webhook.delete();
        } catch (webhookError) {
          console.error(`Error deleting webhook ${webhook_id}:`, webhookError);
        }
      }
    }

    return response.data;
  } catch (error) {
    console.error('Error pruning webhooks for server:', error);
    return null;
  }
}

async function deleteAllWebhooksForServer(serverId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/server/${serverId}`);
    const webhook_configs = response.data;

    await axios.delete(`${DATABASE_MANAGER_URL}/webhook-config/server/${serverId}`);

    for (const webhook_config of webhook_configs) {
      const webhook_id = webhook_config.webhook_id;
      const webhook = await client.fetchWebhook(webhook_id);
      await webhook.delete();
    }
  } catch (error) {
    console.error('Error deleting all webhooks for server:', error);
  }
}

async function createBotWebhookLink(botId, webhookId) {
  try {
    const bot_webhook_data = {
      bot_id: botId,
      webhook_id: webhookId
    };

    const response = await axios.post(`${DATABASE_MANAGER_URL}/bot-webhook`, bot_webhook_data);

    return response.data;
  } catch (error) {
    console.error('Error creating bot webhook link:', error);
  }
}

async function deleteBotWebhookLink(botId, webhookId) {
  try {
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-webhook/${botId}/${webhookId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting bot webhook link:', error);
  }
}

async function updateBotElevenVoiceId(serverId, name, elevenVoiceId, customVoice) {
  try {
    const bot_voice_data = {
      server_id: serverId,
      name: name,
      custom_voice: customVoice,
      eleven_voice_id: elevenVoiceId
    };

    const response = await axios.put(`${DATABASE_MANAGER_URL}/bot-voice`, bot_voice_data);
    return response.data;
  } catch (error) {
    console.error('Error updating bot ElevenVoice ID:', error);
  }
}

module.exports = {
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
};