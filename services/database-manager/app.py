from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from config import DB_CONFIG

app = FastAPI()

class BotConfig(BaseModel):
    owner_id: str
    server_id: str
    name: str
    character_description: str = None
    example_speech: str = None
    voice_description: str = None
    voice_id: str = None
    profile_picture_url: str = None
    webhook_id: str = None
    webhook_url: str = None
    channel_id: str = None

@app.post("/bot-config")
async def create_bot(bot: BotConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check if already exists
        cur.execute("SELECT * FROM bots WHERE owner_id = %s AND server_id = %s", (bot.owner_id, bot.server_id))
        existing_bot = cur.fetchone()
        if existing_bot is not None:
            # Delete existing bot
            cur.execute("DELETE FROM bots WHERE owner_id = %s AND server_id = %s", (bot.owner_id, bot.server_id))
            conn.commit()

        # Create new bot
        cur.execute("""
            INSERT INTO bots (owner_id, server_id, name, character_description, example_speech, voice_description, voice_id, profile_picture_url, webhook_id, webhook_url, channel_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (bot.owner_id, bot.server_id, bot.name, bot.character_description, bot.example_speech, bot.voice_description, bot.voice_id, bot.profile_picture_url, bot.webhook_id, bot.webhook_url, bot.channel_id))
        new_bot = cur.fetchone()
        conn.commit()
        return new_bot
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        conn.rollback()
        print(f"Error creating bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/bot-config/{owner_id}/{server_id}")
async def get_bot(owner_id: str, server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM bots WHERE owner_id = %s AND server_id = %s", (owner_id, server_id))
        bot = cur.fetchone()
        if bot is None:
            raise HTTPException(status_code=404, detail="Bot not found")
        return bot
    finally:
        cur.close()
        conn.close()

@app.put("/bot-config/{owner_id}/{server_id}")
async def update_bot(owner_id: str, server_id: str, bot: BotConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE bots
            SET name = %s, character_description = %s, example_speech = %s, voice_description = %s, voice_id = %s, profile_picture_url = %s, webhook_id = %s, webhook_url = %s, channel_id = %s
            WHERE owner_id = %s AND server_id = %s
            RETURNING *
        """, (bot.name, bot.character_description, bot.example_speech, bot.voice_description, bot.voice_id, bot.profile_picture_url, owner_id, server_id, bot.webhook_id, bot.webhook_url, bot.channel_id))
        updated_bot = cur.fetchone()
        if updated_bot is None:
            raise HTTPException(status_code=404, detail="Bot config not found")
        conn.commit()
        return updated_bot
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/bot-config/{owner_id}/{server_id}")
async def delete_bot(owner_id: str, server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM bots WHERE owner_id = %s AND server_id = %s", (owner_id, server_id))
        conn.commit()
        return {"message": "Bot config deleted successfully"}
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()