from fastapi import FastAPI
from pydantic import BaseModel
from model import generate_response

app = FastAPI()

class RequestModel(BaseModel):
    messages: list
    botName: str
    characterDescription: str
    exampleSpeech: str

@app.post("/generate/")
async def generate_text(request: RequestModel):
    # Character prompt
    system_prompt = f"""You are acting a character in an online Discord chatroom.

Character Name: {request.botName}

Character Description:
{request.characterDescription}

Example Speech:
{request.exampleSpeech}
"""

    # Format messages
    messages = [{"role": "system", "content": system_prompt}]
    for message in request.messages:
        messages.append({"role": message["role"], "content": message["name"] + ": " + message["content"]})

    # Handle request
    response = await generate_response(messages)
    response_object = response.parsed

    response_text = response_object.message
    if not response_text:
        return {"error": f"Failed to generate response, {response_text}"}
    
    return {"reply": response_text}
