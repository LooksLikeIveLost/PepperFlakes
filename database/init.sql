CREATE TABLE bots (
  id SERIAL PRIMARY KEY,
  owner_id VARCHAR(255) NOT NULL,
  server_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  character_description TEXT,
  example_speech TEXT,
  voice_description TEXT,
  voice_id VARCHAR(255),
  profile_picture_url TEXT
);

CREATE TABLE webhooks {
  id SERIAL PRIMARY KEY,
  owner_id VARCHAR(255) NOT NULL,
  server_id VARCHAR(255) NOT NULL,
  webhook_id VARCHAR(255) NOT NULL,
  webhook_url TEXT,
  channel_id VARCHAR(255)
}

CREATE TABLE users {
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  tier VARCHAR(255)
}