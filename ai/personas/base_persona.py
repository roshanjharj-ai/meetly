from abc import ABC, abstractmethod

class BasePersona(ABC):
    def __init__(self, name, project_manager):
        self.name = name
        self.pm = project_manager
        self.graph = None
        self.context = {"participants": [], "state": "INIT"}

    @abstractmethod
    async def on_user_join(self, user_id, all_users):
        """Triggered when a new user joins the meeting."""
        pass
    
    @abstractmethod
    async def attach_bot(self, bot):
        """Triggered when a new user joins the meeting."""
        pass

    @abstractmethod
    async def on_message(self, text, speaker):
        """Triggered when any message (text/speech) is received."""
        pass

    @abstractmethod
    async def on_start(self):
        """Triggered when meeting officially starts."""
        pass

    async def run_graph_step(self, input_data=None):
        """Runs one step in the LangGraph workflow."""
        if input_data:
            self.context["_last_input"] = input_data

        # Optionally set start state manually
        # if start_state:
        #     self.context["state"] = start_state

        if self.graph:
            # ✅ Correct API for modern LangGraph
            self.context = await self.graph.ainvoke(self.context)
