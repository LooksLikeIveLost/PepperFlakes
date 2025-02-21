import os
from openai import AsyncOpenAI
from config import OPENAI_API_KEY

async def generate_response(messages):
    """Generates a response using OpenAI's GPT model."""
    try:
        response = await get_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=150
        )
        return response.choices[0].message
    except Exception as e:
        print(f"Error generating response: {e}")
        return None
    
def get_client():
    return AsyncOpenAI(api_key=OPENAI_API_KEY)
