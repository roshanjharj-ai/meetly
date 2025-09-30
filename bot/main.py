import argparse
from virtual_participant import VirtualParticipant
import asyncio
# --- Configuration ---
DEFAULT_SERVER_URI = "ws://127.0.0.1:8000"


def main():
    parser = argparse.ArgumentParser(description="Run a robust virtual participant bot.")
    parser.add_argument("--room", type=str, required=True, help="The room to join.")
    parser.add_argument("--name", type=str, default="Assistant", help="The name of the bot.")
    parser.add_argument("--server", type=str, default=DEFAULT_SERVER_URI, help="The WebSocket server URI.")
    args = parser.parse_args()
    bot = VirtualParticipant(room_id=args.room, name=args.name, server_uri=args.server)
    try:
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        print("\n🤖 Bot shutting down.")

if __name__ == "__main__":
    main()