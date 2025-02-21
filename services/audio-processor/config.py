import os
from dotenv import load_dotenv

load_dotenv()

ELEVEN_LABS_API_KEY = os.getenv("ELEVEN_LABS_API_KEY")
LANGUAGE_MODEL_URL = os.getenv("LANGUAGE_MODEL_URL")