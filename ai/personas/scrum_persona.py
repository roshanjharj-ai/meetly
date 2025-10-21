from personas.base_persona import BasePersona
from graphs.scrum_graph import scrum_graph
import asyncio
from modules.html_generator import HTMLGenerator

from datetime import datetime, timedelta, timezone

class ScrumPersona(BasePersona):
    def __init__(self, project_manager):
        super().__init__("ScrumBot", project_manager)
        self.graph = scrum_graph
        self.pm = project_manager
        self.context.setdefault("participants", [])
        self.context.setdefault("state", "INIT")
        self.context.setdefault("current_task", 0)
        self.context.setdefault("tasks", [])
        self.context.setdefault("persona", self)
        self.bot = None        
        self.htmlGenerator = HTMLGenerator()
        self.start_time = None
        self.end_time = None

    # **FIX**: Add a new method to broadcast progress updates
    async def _broadcast_progress(self, to_user="all"):
        """Sends the current meeting progress to the listener."""
        if self.bot and hasattr(self.bot, 'on_progress_update'):
            progress_data = {
                "tasks": self.context.get("tasks", []),
                "current_task_index": self.context.get("current_task", 0),
                "state": self.context.get("state"),
				"start_time": self.start_time.isoformat() if self.start_time else None,
                "end_time": self.end_time.isoformat() if self.end_time else None,
            }
            # Pass the target user to the listener
            await self.bot.on_progress_update(progress_data, to_user=to_user)

    def attach_bot(self, bot):
        self.bot = bot

    async def show(self, html, to_user=None):
        if self.bot:
            await self.bot._broadcast_content(html, to_user or "all")
        else:
            print(f"[{self.name}] SHOW -> {to_user or 'all'}: {html}")

    async def say(self, message, to_user=None):
        if self.bot:
            await self.bot._broadcast_message(message, to_user or "all")
        else:
            print(f"[{self.name}] SAY -> {to_user or 'all'}: {message}")

    async def on_start(self):
        print("🧩 Scrum meeting starting...")
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

    async def on_user_join(self, user_id, all_users):
        print(f"[{self.name}] on_user_join: {user_id} - participants now: {all_users}")
        self.context["participants"] = all_users
        await self.say(f"Hello {user_id}, welcome to the meeting!", to_user=user_id)
        current_html = await self._render_current_ui_html()
        if current_html:
            await self.show(current_html, to_user=user_id)
        # Send the current progress to the joining user
        await self._broadcast_progress(to_user=user_id)

    async def on_message(self, text, speaker):
        # The lock is removed, simplifying this method.
        print(f"[{self.name}] Received message from {speaker}: {text}")
        self.context["_last_input"] = {"speaker": speaker, "message": text}
        
        await self.run_graph_step()
        
        # After processing, broadcast the new progress
        await self._broadcast_progress()

        if self.context.get("state") == "evaluating_next_task":
            self.context["_last_input"] = None
            await self.run_graph_step()
            # And broadcast progress again after the bot takes its turn
            await self._broadcast_progress()

    async def _render_current_ui_html(self):
        st = self.context.get("state", "INIT")
        tasks = self.context.get("tasks", []) or (await self.pm.list_tasks() if hasattr(self.pm, "list_tasks") else [])
        cur_idx = int(self.context.get("current_task", 0) or 0)

        if st in ("INIT", "show_tasks", "wait_command"):
            if not tasks:
                return "<div>No tasks for today.</div>"
            return self.htmlGenerator.GetTasksList("Today's Tasks", tasks)

        elif st in ("ASK_FOR_UPDATE", "collecting", "evaluating_next_task"):
            if 0 <= cur_idx < len(tasks):
                return self.htmlGenerator.GetTaskDetails(tasks[cur_idx])
            else:
                return self.htmlGenerator.GetTasksList("Today's Tasks", tasks)

        elif st == "SUMMARY":
            return self.htmlGenerator.GetMeetingSummary(tasks)

        else:
            return f"<div>State: {st}</div>"

    async def _process_with_llm(self, task, speaker, message, node_name=None):
        lower = message.lower()
        if any(k in lower for k in ("done", "completed", "finished")):
            comment = f"{speaker} says they completed the task: '{message}'"
            return {"status": "Done", "comment": comment, "need_comment": True}
        return {"status": task.get("status", "In Progress"), "comment": f"{speaker}: {message}", "need_comment":True}
