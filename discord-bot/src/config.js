const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

async function accessSecretVersion(projectId, secretId, versionId = 'latest') {
  const client = new SecretManagerServiceClient();
  const name = `projects/${projectId}/secrets/${secretId}/versions/${versionId}`;
  const [version] = await client.accessSecretVersion({name});
  return version.payload.data.toString('utf8');
}

// Assuming your GCP project ID is stored in an environment variable
const projectId = process.env.GCP_PROJECT_ID;

async function loadConfig() {
  const config = {
    DISCORD_TOKEN: await accessSecretVersion(projectId, 'DISCORD_TOKEN'),
    LANGUAGE_MODEL_URL: await accessSecretVersion(projectId, 'LANGUAGE_MODEL_URL'),
    AUDIO_PROCESSOR_URL: await accessSecretVersion(projectId, 'AUDIO_PROCESSOR_URL')
  };
  return config;
}

module.exports = loadConfig;