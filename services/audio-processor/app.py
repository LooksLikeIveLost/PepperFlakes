from fastapi import FastAPI, UploadFile, File, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transcriber import transcribe_audio
from tts import text_to_speech
import io
import os

app = FastAPI()

class TextToSpeechRequest(BaseModel):
    text: str
    eleven_voice_id: str

@app.post("/transcribe-audio/")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    audio_data = await file.read()
    return {"transcription": transcribe_audio(audio_data)}

@app.post("/text-to-speech/")
async def text_to_speech_endpoint(request: TextToSpeechRequest):
    audio_content = text_to_speech(request.text, request.eleven_voice_id)
    if audio_content:
        return StreamingResponse(io.BytesIO(audio_content), media_type="audio/mpeg")
    else:
        return Response(content="Failed to generate audio", status_code=500)
