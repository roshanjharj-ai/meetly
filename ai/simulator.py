import asyncio
from personas.scrum_persona import ScrumPersona
from project_manager.ado import ADOProjectManager


class DummyBot:
    """Mimics your VirtualListener messaging layer for console simulation."""
    def __init__(self):
        self.processor = None  # you can plug your LLM processor here later

    async def _broadcast_message(self, message, to_user):
        print(f"\n[BOT->AUDIO:{to_user}] 🎙️ {message}")

    async def _broadcast_content(self, html, to_user):
        print(f"\n[BOT->UI:{to_user}] 📄 {html}\n")


async def simulate_meeting():
    # Setup dummy environment
    pm = ADOProjectManager()
    persona = ScrumPersona(pm)
    bot = DummyBot()
    persona.attach_bot(bot)

    # Start meeting
    await persona.on_start()

    # Simulate users joining
    users = ["Santosh Police Patil", "Santosh PP", "Roshan Kumar Jha"]
    for u in users:
        await persona.on_user_join(u, users)

    print("\n🚀 Scrum meeting simulation started.")
    print("Type messages below (e.g., 'start', 'done', 'working on it', etc.)")
    print("Type 'quit' to end simulation.\n")

    # Pick speakers in round-robin for simulation
    speakers = ["Santosh Police Patil", "Santosh PP", "Roshan Kumar Jha"]
    idx = 0

    while True:
        msg = input(f"{speakers[idx]} > ").strip()
        if msg.lower() == "quit":
            print("Ending simulation...")
            break
        await persona.on_message(msg, speakers[idx])
        # rotate speaker
        idx = (idx + 1) % len(speakers)
        await asyncio.sleep(0.2)


if __name__ == "__main__":
    asyncio.run(simulate_meeting())
