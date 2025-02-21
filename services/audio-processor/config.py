import os
from dotenv import load_dotenv

load_dotenv()

ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY")
LANGUAGE_MODEL_API = os.getenv("LANGUAGE_MODEL_API", "http://language-model-service:5000/generate")
