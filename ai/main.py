import argparse
import asyncio
import os
from core.listener import VirtualListener


async def run_bot(room: str, name: str, server: str):
    bot = VirtualListener(room, name, server)
    await bot.connect()
    while True:
        await asyncio.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="WebRTC Virtual Listener Bot")
    parser.add_argument("--room", required=False, help="Room name for the WebRTC session")
    parser.add_argument("--name", default="Jarvis", help="Bot name")
    parser.add_argument("--server", default=None, help="WebSocket signaling server URL")
    args = parser.parse_args()

    # 🔹 Fallback to environment variables if not provided as args
    room = args.room or os.getenv("BOT_ROOM", "myroom")
    name = args.name or os.getenv("BOT_NAME", "Jarvis")
    server = args.server or os.getenv("BOT_SERVER_URL", "wss://meetly-server-bkhgbua4gwf4hrcb.canadacentral-01.azurewebsites.net/ws")

    print(f"[bot:{name}] 🚀 Starting bot for room '{room}' using server '{server}'")

    try:
        asyncio.run(run_bot(room, name, server))
    except KeyboardInterrupt:
        print("\nBot shutting down.")


if __name__ == "__main__":
    main()
