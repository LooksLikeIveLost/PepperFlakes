from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from elevenlabs import ElevenLabs
from transcriber import transcribe_audio
import io
import os
import base64
from config import ELEVEN_LABS_API_KEY

app = FastAPI()

# Crate client
client = ElevenLabs(
    api_key=ELEVEN_LABS_API_KEY
)

class TextToSpeechRequest(BaseModel):
    text: str
    eleven_voice_id: str

class VoicePreviewRequest(BaseModel):
    voice_description: str
    text: str

class VoiceCreationRequest(BaseModel):
    voice_name: str
    voice_description: str
    generated_voice_id: str

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
    
@app.post("/generate-voice-previews/")
async def generate_voice_previews(request: VoicePreviewRequest):
    try:
        data = client.text_to_voice.create_previews(
            voice_description=request.voice_description,
            text=request.text
        )
        return {"previews": data.previews}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate previews: {str(e)}")

@app.post("/create-voice-from-preview/")
async def create_voice_from_preview(request: VoiceCreationRequest):
    try:
        voice = client.text_to_voice.create_voice_from_preview(
            voice_name=request.voice_name,
            voice_description=request.voice_description,
            generated_voice_id=request.generated_voice_id
        )
        return {"voice_id": voice.voice_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create voice: {str(e)}")
    
@app.post("/clone-voice/")
async def clone_voice(
    voice_name: str = Form(...),
    voice_file: UploadFile = File(...)
):
    try:
        # Save the uploaded file
        file_path = f"temp_{voice_name}.mp3"
        with open(file_path, "wb") as buffer:
            content = await voice_file.read()
            buffer.write(content)

        # Clone the voice
        voice = client.voices.add(
            name=voice_name,
            files=[file_path],
        )

        # Remove the temporary file
        os.remove(file_path)

        return {"voice_id": voice.voice_id}
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to clone voice: {str(e)}")
    
@app.post("/delete-voice/{voice_id}")
async def delete_voice(voice_id: str):
    # Delete voice and return success message
    try:
        client.voices.delete(voice_id)
        return {"message": "Voice deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete voice: {str(e)}")
    
def text_to_speech(text, eleven_voice_id):
    # Converts text to speech using Eleven Labs API.
    if len(text) > 128:
        text = text[:128]  # Truncate long responses

    try:
        audio_stream = client.text_to_speech.convert(
            text=text,
            voice_id=eleven_voice_id,
            model_id="eleven_multilingual_v2"
        )

        # Read the generator into a BytesIO object
        buffer = io.BytesIO()
        for chunk in audio_stream:
            buffer.write(chunk)
        
        # Get the bytes from the buffer
        audio_bytes = buffer.getvalue()
        return audio_bytes
    except Exception as e:
        print(f"Error in text_to_speech: {e}")
        return None