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
    "custom-voice": false
  },
  "basic": {
    "bot-quota": 3,
    "member-quota": 200,
    "voice-enabled": true,
    "custom-voice": false
  },
  "premium": {
    "bot-quota": 6,
    "member-quota": -1,
    "voice-enabled": true,
    "custom-voice": true
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
  const member = await guild.members.fetch(discordId);

  if (!member) {
    return 'free';
  }

  for (const [roleName, tier] of Object.entries(TIER_ROLES)) {
    if (member.roles.cache.some(role => role.name.contains(roleName))) {
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