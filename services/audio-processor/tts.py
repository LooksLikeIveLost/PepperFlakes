import os
import requests
from config import ELEVEN_LABS_API_KEY 

VOICE_ID = "CwhRBWXzGAHq8TQ4Fs17"

def text_to_speech(text):
    """Converts text to speech using Eleven Labs API."""
    if len(text) > 128:
        text = text[:128]  # Truncate long responses

    headers = {
        "Accept": "audio/mpeg",
        "xi-api-key": ELEVEN_LABS_API_KEY,
        "Content-Type": "application/json",
    }
    
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.5
        }
    }

    response = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        headers=headers,
        json=payload
    )

    if response.status_code == 200:
        return response.content

    return None
