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

class WebhookConfig(BaseModel):
    owner_id: str
    server_id: str
    channel_id: str
    webhook_id: str
    webhook_url: str

@app.post("/bot-config")
async def create_bot(bot: BotConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check if already exists
        cur.execute("SELECT * FROM bots WHERE owner_id = %s AND server_id = %s", (bot.owner_id, bot.server_id))
        existing_bot = cur.fetchone()
        if existing_bot is not None:
            raise HTTPException(status_code=400, detail="Bot already exists")

        # Create new bot
        cur.execute("""
            INSERT INTO bots (owner_id, server_id, name, character_description, example_speech, voice_description, voice_id, profile_picture_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (bot.owner_id, bot.server_id, bot.name, bot.character_description, bot.example_speech, bot.voice_description, bot.voice_id, bot.profile_picture_url))
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

# Get bot configs and webhook configs by server and channel id
@app.get("/bot-config/channel/{server_id}/{channel_id}")
async def get_bot_config(server_id: str, channel_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    # Join bot_configs and webhook_configs tables on owner_id and server_id
    try:
        cur.execute("""
            SELECT bots.*, webhook_configs.webhook_id, webhook_configs.webhook_url, webhook_configs.channel_id
            FROM bots
            JOIN webhook_configs ON bots.owner_id = webhook_configs.owner_id AND bots.server_id = webhook_configs.server_id
            WHERE webhook_configs.server_id = %s AND webhook_configs.channel_id = %s
        """, (server_id, channel_id))
        bot_configs = cur.fetchall()
        return bot_configs
    finally:
        cur.close()
        conn.close()

# Get bot config by server id and name
@app.get("/bot-config/name/{server_id}/{name}")
async def get_bot_config(server_id: str, name: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM bots WHERE server_id = %s AND name = %s", (server_id, name))
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
            SET name = %s, character_description = %s, example_speech = %s, voice_description = %s, voice_id = %s, profile_picture_url = %s
            WHERE owner_id = %s AND server_id = %s
            RETURNING *
        """, (bot.name, bot.character_description, bot.example_speech, bot.voice_description, bot.voice_id, bot.profile_picture_url, owner_id, server_id))
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

@app.delete("/bot-config/server/{server_id}")
async def delete_server_bots(server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM bots WHERE server_id = %s", (server_id,))
        conn.commit()
        return {"message": "Server bots deleted successfully"}
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/webhook-config")
async def create_webhook_config(webhook_config: WebhookConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO webhook_configs (owner_id, server_id, channel_id, webhook_id, webhook_url)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (webhook_config.owner_id, webhook_config.server_id, webhook_config.channel_id, webhook_config.webhook_id, webhook_config.webhook_url))
        new_webhook_config = cur.fetchone()
        conn.commit()
        return new_webhook_config
    finally:
        cur.close()
        conn.close()

@app.get("/webhook-config/{owner_id}/{server_id}/{channel_id}")
async def get_webhook_config(owner_id: str, server_id: str, channel_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM webhook_configs WHERE owner_id = %s AND server_id = %s AND channel_id = %s", (owner_id, server_id, channel_id))
        webhook_config = cur.fetchone()
        if webhook_config is None:
            raise HTTPException(status_code=404, detail="Webhook config not found")
        return webhook_config
    finally:
        cur.close()
        conn.close()

@app.get("/webhook-config/{owner_id}/{server_id}")
async def get_webhook_configs(owner_id: str, server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM webhook_configs WHERE owner_id = %s AND server_id = %s", (owner_id, server_id))
        webhook_configs = cur.fetchall()
        return webhook_configs
    finally:
        cur.close()
        conn.close()

@app.get("/webhook-config/server/{server_id}")
async def get_server_webhook_configs(server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM webhook_configs WHERE server_id = %s", (server_id,))
        webhook_configs = cur.fetchall()
        return webhook_configs
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/{owner_id}/{server_id}/{channel_id}")
async def delete_webhook_config(owner_id: str, server_id: str, channel_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM webhook_configs WHERE owner_id = %s AND server_id = %s AND channel_id = %s", (owner_id, server_id, channel_id))
        conn.commit()
        return {"message": "Webhook config deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/{owner_id}/{server_id}")
async def delete_server_webhook_configs(owner_id: str, server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM webhook_configs WHERE owner_id = %s AND server_id = %s", (owner_id, server_id))
        conn.commit()
        return {"message": "Server webhook configs deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/server/{server_id}")
async def delete_server_webhook_configs(server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM webhook_configs WHERE server_id = %s", (server_id,))
        conn.commit()
        return {"message": "Server webhook configs deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.get("/user/{user_id}")
async def get_user(user_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
        user = cur.fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
        conn.close()

@app.get("/user/{user_id}/bot-count")
async def get_user_bot_count(user_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT users.*, COUNT(bots.bot_id) AS bot_count
            FROM users
            LEFT JOIN bots ON users.user_id = bots.owner_id
            WHERE users.user_id = %s
            GROUP BY users.user_id
        """, (user_id,))
        user = cur.fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    finally:
        cur.close()
        conn.close()