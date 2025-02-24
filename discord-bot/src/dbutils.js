const axios = require('axios');
const { DATABASE_MANAGER_URL } = require('./config');
const { getClient } = require('./utils');
const client = getClient();

// tier map
const tierMap = {
  "free": {
    "bot-quota": 1,
    "voice-enabled": false
  },
  "basic": {
    "bot-quota": 3,
    "voice-enabled": true
  },
  "premium": {
    "bot-quota": 5,
    "voice-enabled": true
  }
};

DEV_TIER = "dev";

async function getUser(userId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/user/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

async function getUserBotCount(userId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/user/${userId}/bot-count`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user bot count:', error);
    return null;
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

async function getBotConfigsByChannel(serverId, channelId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/channel/${serverId}/${channelId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bot configs by channel:', error);
    return null;
  }
}

async function getBotConfigByCharacterName(serverId, characterName) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/bot-config/name/${serverId}/${characterName}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching bot config by character name:', error);
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

async function deleteBotConfig(ownerId, serverId) {
  try {
    // Delete bot config
    const response = await axios.delete(`${DATABASE_MANAGER_URL}/bot-config/${ownerId}/${serverId}`);

    return response.data;
  } catch (error) {
    console.error('Error deleting configs:', error);
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

async function createWebhook(owner_id, channel) {
  try {
    console.log('Creating webhook for channel:', channel.id);

    // Check if webhook exists (from database)
    const existingWebhook = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/${owner_id}/${channel.guild.id}/${channel.id}`);

    if (existingWebhook.data) {
      return existingWebhook.data;
    }

    const webhook = await channel.createWebhook({
      name: "Custom Bot Webhook",
      avatar: client.user.avatarURL(),
    });

    // Send to database
    const webhookData = {
      owner_id: owner_id,
      server_id: channel.guild.id,
      channel_id: channel.id,
      webhook_id: webhook.id,
      webhook_url: webhook.url
    }

    await axios.post(`${DATABASE_MANAGER_URL}/webhook-config`, webhookData);

    console.log('Webhook created:', webhook);
    return webhook;
  } catch (error) {
    console.error('Error creating webhook:', error);
    return null;
  }
}

async function deleteWebhook(ownerId, serverId, channelId) {
  // Get webhook info, then delete from server and database
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/${ownerId}/${serverId}/${channelId}`);
    const webhook_data = response.data;
    const webhook_id = webhook_data.webhook_id;
    await axios.delete(`${DATABASE_MANAGER_URL}/webhook-config/${ownerId}/${serverId}/${channelId}`);

    const webhook = await client.fetchWebhook(webhook_id);
    await webhook.delete();
  } catch (error) {
    console.error('Error deleting webhook:', error);
  }
}

async function deleteAllWebhooks(ownerId, serverId) {
  try {
    const response = await axios.get(`${DATABASE_MANAGER_URL}/webhook-config/${ownerId}/${serverId}`);
    const webhook_configs = response.data;

    await axios.delete(`${DATABASE_MANAGER_URL}/webhook-config/${ownerId}/${serverId}`);

    for (const webhook_config of webhook_configs) {
      const webhook_id = webhook_config.webhook_id;
      const webhook = await client.fetchWebhook(webhook_id);
      await webhook.delete();
    }
  } catch (error) {
    console.error('Error deleting all webhooks:', error);
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

module.exports = {
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
};