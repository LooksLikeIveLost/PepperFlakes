CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(255)
);

CREATE TABLE bots (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  server_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  character_description TEXT,
  example_speech TEXT,
  voice_description TEXT,
  voice_id VARCHAR(255),
  profile_picture_url TEXT,
  
  UNIQUE (owner_id, server_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  server_id VARCHAR(255) NOT NULL,
  webhook_id VARCHAR(255) NOT NULL,
  webhook_url TEXT,
  channel_id VARCHAR(255),

  UNIQUE (server_id, channel_id)
);

CREATE TABLE bots_webhooks (
  bot_id INTEGER NOT NULL,
  webhook_id INTEGER NOT NULL,
  PRIMARY KEY (bot_id, webhook_id),
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);