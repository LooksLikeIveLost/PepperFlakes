import os
from google.cloud import speech

def transcribe_audio(audio_data):
    """Converts speech to text using Google Speech-to-Text API."""
    client = speech.SpeechClient()
    
    audio = speech.RecognitionAudio(content=audio_data)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=48000,
        language_code="en-US",
        audio_channel_count=2,
    )

    try:
        response = client.recognize(config=config, audio=audio)
        if response.results:
            return response.results[0].alternatives[0].transcript
    except Exception as e:
        print(f"Error in transcribing audio: {e}")
    
    return None
