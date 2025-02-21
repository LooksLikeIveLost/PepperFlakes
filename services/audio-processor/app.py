from fastapi import FastAPI, UploadFile, File
from transcriber import transcribe_audio
from tts import text_to_speech
import os
from config import LANGUAGE_MODEL_API

app = FastAPI()

@app.post("/process-audio/")
async def process_audio(username: str, messages: list, file: UploadFile = File(...)):
    audio_data = await file.read()
    
    transcription = transcribe_audio(audio_data)
    if not transcription:
        return {"error": "No transcription found"}
    
    # Add the transcription to the messages list
    messages.append({"role": "user", "content": username + ": " + transcription})

    # Call the external language model API to generate a response
    response_text = get_language_model_response(messages)
    if not response_text:
        return {"error": "No AI response"}

    # Convert text response to speech
    audio_response = text_to_speech(response_text)
    if not audio_response:
        return {"error": "TTS failed"}

    return {"audio_file": audio_response}

def get_language_model_response(messages: list):
    import requests
    
    response = requests.post(LANGUAGE_MODEL_API, json={"messages": messages})
    if response.status_code == 200:
        return response.json().get("reply")
    return None
