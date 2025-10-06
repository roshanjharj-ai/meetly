import argparse
import asyncio
from core.listener import VirtualListener


async def run_bot(room: str, name: str, server: str):
    bot = VirtualListener(room, name, server)
    await bot.connect()
    while True:
        await asyncio.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="WebRTC Virtual Listener Bot")
    parser.add_argument("--room", required=True)
    parser.add_argument("--name", default="Jarvis")
    parser.add_argument("--server", default="ws://127.0.0.1:8000/ws")
    args = parser.parse_args()

    try:
        asyncio.run(run_bot(args.room, args.name, args.server))
    except KeyboardInterrupt:
        print("\nBot shutting down.")


if __name__ == "__main__":
    main()
