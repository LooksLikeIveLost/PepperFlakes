const { Client, GatewayIntentBits } = require('discord.js');
const { MAIN_SERVER_ID } = require('./config');

// initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
});

// tier map
const tierMap = {
  "free": {
    "bot-quota": 1,
    "member-quota": 40,
    "voice-enabled": false,
    "custom-voice": false,
    "context-size": 8,
    "response-time": 6
  },
  "basic": {
    "bot-quota": 3,
    "member-quota": 200,
    "voice-enabled": true,
    "custom-voice": false,
    "context-size": 32,
    "response-time": 2
  },
  "premium": {
    "bot-quota": 6,
    "member-quota": -1,
    "voice-enabled": true,
    "custom-voice": true,
    "context-size": 64,
    "response-time": 1
  }
};

const getClient = () => client;

const getUsername = async (userId) => {
  const user = await client.users.fetch(userId);
  return user.username;
};

const notifyUserTierChange = async (userId, newTier) => {
  const user = await client.users.fetch(userId);
  await user.send(`Your subscription tier has changed to ${newTier}. ${newTier === 'free' ? 'Consider renewing your subscription to keep your benefits!' : 'Thank you for your support!'}`);
};

async function getUserTierFromRoles(discordId) {
  // Get member from discord id
  const guild = await client.guilds.fetch(MAIN_SERVER_ID);
  if (!guild) {
    console.error(`Guild with ID ${MAIN_SERVER_ID} not found`);
    return 'free';
  }

  const member = await guild.members.fetch(discordId);
  if (!member) {
    console.error(`Member with ID ${discordId} not found in guild ${MAIN_SERVER_ID}`);
    return 'free';
  }

  for (const [roleName, tier] of Object.entries(TIER_ROLES)) {
    // Chheck if role name contains roleName keyword
    if (member.roles.cache.some(role => role.name.toLowerCase().includes(roleName.toLowerCase()))) {
      return tier;
    }
  }
  return 'free';
}

const TIER_ROLES = {
  'Premium': 'premium',
  'Basic': 'basic',
};

module.exports = { tierMap, getClient, getUsername, notifyUserTierChange, getUserTierFromRoles };