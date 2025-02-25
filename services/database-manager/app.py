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
    eleven_voice_id: str = None
    profile_picture_url: str = None

class WebhookConfig(BaseModel):
    server_id: str
    channel_id: str
    webhook_id: str
    webhook_url: str

class BotWebhook(BaseModel):
    bot_id: str
    webhook_id: str

class User(BaseModel):
    user_id: str
    tier: str

@app.post("/bot-config")
async def create_bot(bot: BotConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check if already exists
        cur.execute("SELECT * FROM bots WHERE server_id = %s AND name = %s", (bot.server_id, bot.name))
        existing_bot = cur.fetchone()
        if existing_bot is not None:
            raise HTTPException(status_code=400, detail="Bot already exists")

        # Create user if not exists and get user_id
        cur.execute("SELECT * FROM users WHERE user_id = %s", (bot.owner_id,))
        user = cur.fetchone()
        if user is None:
            cur.execute("INSERT INTO users (user_id) VALUES (%s)", (bot.owner_id,))
            conn.commit()
            cur.execute("SELECT * FROM users WHERE user_id = %s", (bot.owner_id,))
            user = cur.fetchone()

        user_id = user["user_id"]

        # Create voice if not exists and get eleven_voice_id
        cur.execute("SELECT * FROM voices WHERE eleven_voice_id = %s", (bot.eleven_voice_id,))
        voice = cur.fetchone()
        if voice is None:
            cur.execute("INSERT INTO voices (eleven_voice_id) VALUES (%s)", (bot.eleven_voice_id,))
            conn.commit()
            cur.execute("SELECT * FROM voices WHERE eleven_voice_id = %s", (bot.eleven_voice_id,))
            voice = cur.fetchone()

        voice_id = voice["eleven_voice_id"]

        # Create new bot
        cur.execute("""
            INSERT INTO bots (owner_id, server_id, name, character_description, example_speech, voice_id, profile_picture_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (user_id, bot.server_id, bot.name, bot.character_description, bot.example_speech, voice_id, bot.profile_picture_url))
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

@app.get("/bot-config/{server_id}/{name}")
async def get_bot(server_id: str, name: str):
    # Get bot config join with voice
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT b.*, v.*
            FROM bots b
            JOIN voices v ON b.voice_id = v.id
            WHERE b.server_id = %s AND b.name = %s
        """, (server_id, name))
        bot = cur.fetchone()
        if bot is None:
            raise HTTPException(status_code=404, detail="Bot config not found")
        return bot
    finally:
        cur.close()
        conn.close()

@app.get("/bot-config/channel/{server_id}/{channel_id}")
async def get_bots_by_channel(server_id: str, channel_id: str):
    # Get bots that use webhook with server id and channel id and join
    # Must use bot_webhooks table to join
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT b.*, wc.*
            FROM bots b
            JOIN bot_webhooks bw ON b.id = bw.bot_id
            JOIN webhook_configs wc ON bw.webhook_id = wc.id
            WHERE wc.server_id = %s AND wc.channel_id = %s
        """, (server_id, channel_id))
        bots = cur.fetchall()
        return bots
    finally:
        cur.close()
        conn.close()

@app.put("/bot-config/{server_id}/{name}")
async def update_bot(server_id: str, name: str, bot: BotConfig):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check if bot with name already exists
        cur.execute("SELECT * FROM bots WHERE server_id = %s AND name = %s", (server_id, bot.name))
        existing_bot = cur.fetchone()
        if existing_bot is not None:
            raise HTTPException(status_code=400, detail="Bot already exists")

        cur.execute("""
            UPDATE bots
            SET name = %s, character_description = %s, example_speech = %s, profile_picture_url = %s
            WHERE server_id = %s AND name = %s
            RETURNING *
        """, (bot.name, bot.character_description, bot.example_speech, bot.profile_picture_url, server_id, name))
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

@app.delete("/bot-config/{server_id}/{name}")
async def delete_bot(server_id: str, name: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM bots WHERE server_id = %s", (server_id, name))
        conn.commit()
        return {"message": "Bot config deleted successfully"}
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/bot-config/owner/{owner_id}")
async def delete_owner_bots(owner_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM bots WHERE owner_id = %s", (owner_id,))
        conn.commit()
        return {"message": "Owner bots deleted successfully"}
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
            INSERT INTO webhook_configs (server_id, channel_id, webhook_id, webhook_url)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (webhook_config.server_id, webhook_config.channel_id, webhook_config.webhook_id, webhook_config.webhook_url))
        new_webhook_config = cur.fetchone()
        conn.commit()
        return new_webhook_config
    finally:
        cur.close()
        conn.close()

@app.get("/webhook-config/{server_id}/{channel_id}")
async def get_webhook_config(server_id: str, channel_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM webhook_configs WHERE server_id = %s AND channel_id = %s", (server_id, channel_id))
        webhook_config = cur.fetchone()
        if webhook_config is None:
            raise HTTPException(status_code=404, detail="Webhook config not found")
        return webhook_config
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

@app.delete("/webhook-config/prune/{server_id}/{channel_id}")
async def prune_webhook(server_id: str, channel_id: str):
    # Delete if not referenced in bot_webhooks table
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Get webhook id
        cur.execute("SELECT webhook_id FROM webhook_configs WHERE server_id = %s AND channel_id = %s", (server_id, channel_id))
        webhook = cur.fetchone()
        if webhook is None:
            raise HTTPException(status_code=404, detail="Webhook config not found")
        # Delete if not referenced in bot_webhooks table
        cur.execute("DELETE FROM webhook_configs WHERE server_id = %s AND channel_id = %s", (server_id, channel_id))
        conn.commit()
        
        # Return webhook id
        return webhook
        
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/prune-server/{server_id}")
async def prune_server_webhook_configs(server_id: str):
    # Delete if not referenced in bot_webhooks table
    # Return list of webhook ids
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Get webhook ids
        cur.execute("SELECT webhook_id FROM webhook_configs WHERE server_id = %s", (server_id,))
        webhooks = cur.fetchall()
        
        # Delete if not referenced in bot_webhooks table
        cur.execute("DELETE FROM webhook_configs WHERE server_id = %s", (server_id,))
        conn.commit()
        
        # Return webhook ids
        return webhooks
        
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/{server_id}/{channel_id}")
async def delete_webhook_config(owner_id: str, server_id: str, channel_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM webhook_configs WHERE server_id = %s AND channel_id = %s", (server_id, channel_id))
        conn.commit()
        return {"message": "Webhook config deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.delete("/webhook-config/{server_id}")
async def delete_server_webhook_configs(server_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM webhook_configs WHERE server_id = %s", (server_id))
        conn.commit()
        return {"message": "Server webhook configs deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.post("bot-webhook")
async def create_bot_webhook(bot_webhook: BotWebhook):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO bot_webhooks (bot_id, webhook_id)
            VALUES (%s, %s)
            RETURNING *
        """, (bot_webhook.bot_id, bot_webhook.webhook_id))
        new_bot_webhook = cur.fetchone()
        conn.commit()
        return new_bot_webhook
    finally:
        cur.close()
        conn.close()

@app.delete("/bot-webhook/{bot_id}/{webhook_id}")
async def delete_bot_webhook(bot_id: str, webhook_id: str):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("DELETE FROM bot_webhooks WHERE bot_id = %s AND webhook_id = %s", (bot_id, webhook_id))
        conn.commit()
        return {"message": "Bot webhook deleted successfully"}
    finally:
        cur.close()
        conn.close()

@app.post("/user")
async def create_user(user: User):
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO users (user_id, tier)
            VALUES (%s, %s)
            RETURNING *
        """, (user.user_id, user.tier))
        new_user = cur.fetchone()
        conn.commit()
        return new_user
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
            LEFT JOIN bots ON users.id = bots.owner_id
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