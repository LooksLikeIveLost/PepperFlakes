import os
from google.cloud import secretmanager

def access_secret_version(project_id, secret_id, version_id="latest"):
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# Assuming your GCP project ID is stored in an environment variable
project_id = os.getenv("GCP_PROJECT_ID")

ELEVEN_LABS_API_KEY = access_secret_version(project_id, "ELEVEN_LABS_API_KEY")
LANGUAGE_MODEL_URL = access_secret_version(project_id, "LANGUAGE_MODEL_URL")