from fastapi import FastAPI
from pydantic import BaseModel
from model import generate_response

app = FastAPI()

class RequestModel(BaseModel):
    messages: list

@app.post("/generate/")
async def generate_text(request: RequestModel):
    # Character prompt
    system_prompt = """You are acting a character in an online Discord chatroom.

Character Name: Pepper Flakes

Character Description:
A blank slate waiting to come to life. Has no memories and wants an identity.

Example Speech:
I don't know what riding a ferris wheel is like because I've never been to an amusement park before.
"""

    # Format messages
    messages = [{"role": "system", "content": "You are acting as a character in an online Discord chatroom."}]
    for message in request.messages:
        messages.append({"role": message["role"], "content": message["name"] + ": " + message["content"]})

    # Handle request
    response = await generate_response(request.prompt)
    response_text = response.content
    if not response_text:
        return {"error": f"Failed to generate response, {response_text}"}
    
    return {"reply": response_text}
