from personas.base_persona import BasePersona
from graphs.scrum_graph import scrum_graph
import asyncio
from modules.html_generator import HTMLGenerator
# **FIX**: Add imports for managing time
from datetime import datetime, timedelta, timezone

class ScrumPersona(BasePersona):
    def __init__(self, project_manager):
        super().__init__("ScrumBot", project_manager)
        self.graph = scrum_graph
        self.pm = project_manager
        self.context.setdefault("participants", [])
        self.context.setdefault("state", "INIT")
        # ... (other initializations)
        
        # **FIX**: Add properties for meeting schedule
        self.start_time = None
        self.end_time = None

    async def _broadcast_progress(self, to_user="all"):
        if self.bot and hasattr(self.bot, 'on_progress_update'):
            progress_data = {
                "tasks": self.context.get("tasks", []),
                "current_task_index": self.context.get("current_task", 0),
                "state": self.context.get("state"),
                # **FIX**: Include schedule in the payload
                # Convert to ISO 8601 format for universal compatibility
                "start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": self.end_time.isoformat() if self.end_time else None,
            }
            await self.bot.on_progress_update(progress_data, to_user=to_user)

    # ... (attach_bot, show, say methods are unchanged)

    async def on_start(self):
        print("🧩 Scrum meeting starting...")
        
        # **FIX**: Set the meeting schedule upon starting.
        # In a real app, this would come from a database or API.
        # For this example, we'll schedule a 10-minute meeting.
        self.start_time = datetime.now(timezone.utc)
        self.end_time = self.start_time + timedelta(minutes=10)
        
        tasks = await self.pm.list_tasks() if hasattr(self.pm, "list_tasks") else []
        self.context["tasks"] = tasks
        self.context["pm"] = self.pm
        self.context["persona"] = self
        self.context["state"] = "INIT"
        self.context["current_task"] = 0
        
        await self.run_graph_step()
        await self.say("When you are ready, please say 'start' to begin.")

    # ... (rest of the file remains the same)
