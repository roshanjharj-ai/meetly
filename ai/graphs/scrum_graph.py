from typing import TypedDict, Any, Dict
from langgraph.graph import StateGraph, START, END

# Define a state schema — what data your graph carries between nodes
class ScrumState(TypedDict, total=False):
    persona: Any
    pm: Any
    tasks: list
    current_task: int
    waiting_for: str
    _last_input: Dict[str, Any]
    joined_user: str
    state: str

def build_scrum_graph():
    g = StateGraph(ScrumState)

    # ==============================================================================
    # 1. DEFINE GRAPH NODES
    # ==============================================================================

    async def init(state: ScrumState):
        persona = state["persona"]
        await persona.say(f"Good morning everyone! Let's start the Scrum meeting.")
        return {"state": "show_tasks"}

    async def node_show_tasks(state: ScrumState):
        persona = state["persona"]
        tasks = state.get("tasks", [])
        if not tasks:
            await persona.say("Looks like there are no tasks today.")
            return {"state": "summary"}

        await persona.show(persona.htmlGenerator.GetTasksList("Today's Tasks", tasks))
        
        # This ensures the stepper appears as soon as the tasks are shown
        if hasattr(persona, '_broadcast_progress'):
            await persona._broadcast_progress()
            
        return {"state": "wait_command", "current_task": 0}

    async def wait_command(state: ScrumState):
        # This is a passive waiting state. The router handles all logic.
        return {}

    async def node_ask_update(state: ScrumState):
        persona = state["persona"]
        tasks = state.get("tasks", [])
        idx = state.get("current_task", 0)
        task = tasks[idx]
        
        await persona.show(persona.htmlGenerator.GetTaskDetails(task))
        await persona.say(f"{task['owner']}, can you give an update on '{task['title']}'?", to_user=task["owner"])
        
        return {"state": "collecting", "waiting_for": task["owner"]}

    async def node_collecting(state: ScrumState):
        print("In node_collecting...")
        persona = state["persona"]
        pm = state["pm"]
        last = state.get("_last_input")
        speaker = last.get("speaker")
        message = (last.get("message") or "").strip()
        waiting_for = state.get("waiting_for")

        if speaker != waiting_for:
            await persona.say(f"{speaker}, I’m waiting for an update from {waiting_for}.")
            return {"_last_input": None}

        idx = state.get("current_task", 0)
        tasks = state.get("tasks", [])
        task = tasks[idx]
        result = await persona._process_with_llm(task, speaker, message)
        status = result.get("status", task.get("status"))
        comment = result.get("comment", message)
        
        if hasattr(pm, 'add_comment'): pm.add_comment(task["id"], comment)
        if hasattr(pm, 'update_task_status'): pm.update_task_status(task["id"], status)
        
        # **FIX**: After updating the task, fetch the fresh list from the Project Manager.
        # This ensures the state sent to the UI is always up-to-date.
        updated_tasks = await pm.list_tasks() if pm else tasks
        
        await persona.say(f"Thanks {speaker}, marking '{task['title']}' as {status}.")
        
        # **FIX**: Return the updated_tasks list in the state.
        return {"current_task": idx + 1, "state": "evaluating_next_task", "tasks": updated_tasks}

    async def summary(state: ScrumState):
        persona = state["persona"]
        tasks = state.get("tasks", [])
        await persona.show(persona.htmlGenerator.GetMeetingSummary(tasks))
        await persona.say("Meeting complete. Here's the summary of today's updates.")
        return {"state": "done"}

    async def prompt_for_start(state: ScrumState):
        persona = state["persona"]
        speaker = state.get("_last_input").get("speaker", "everyone")
        await persona.say(f"{speaker}, please say 'start' to begin the updates.")
        return {"_last_input": None}

    def placeholder_should_continue(state: ScrumState):
        # This node is a placeholder that allows a conditional edge to be attached.
        return {}

    # ==============================================================================
    # 2. DEFINE ROUTING LOGIC
    # ==============================================================================

    def route_start(state: ScrumState):
        """The main entry router. Directs flow based on the current meeting state."""
        current_state = state.get("state", "INIT")
        if current_state == "INIT":
            return "init"
        elif current_state == "wait_command":
            return "wait_command"
        elif current_state == "collecting":
            return "collecting"
        # When the bot triggers its own run, this route is taken.
        elif current_state == "evaluating_next_task":
            return "should_continue_router"
        else:
            return END

    def route_after_wait_command(state: ScrumState):
        last_input = state.get("_last_input")
        if not last_input:
            return END

        if (last_input.get("message") or "").strip().lower() == "start":
            return "ask_update"
        else:
            return "prompt_for_start"

    def should_continue(state: ScrumState):
        tasks = state.get("tasks", [])
        current_task_idx = state.get("current_task", 0)
        return "ask_update" if current_task_idx < len(tasks) else "summary"

    # ==============================================================================
    # 3. BUILD THE GRAPH
    # ==============================================================================

    g.add_node("init", init)
    g.add_node("show_tasks", node_show_tasks)
    g.add_node("wait_command", wait_command)
    g.add_node("prompt_for_start", prompt_for_start)
    g.add_node("ask_update", node_ask_update)
    g.add_node("collecting", node_collecting)
    g.add_node("summary", summary)
    g.add_node("should_continue_router", placeholder_should_continue)

    g.add_conditional_edges(
        START,
        route_start,
        {
            "init": "init", 
            "wait_command": "wait_command", 
            "collecting": "collecting",
            "should_continue_router": "should_continue_router",
            END: END
        }
    )

    g.add_edge("init", "show_tasks")
    g.add_edge("show_tasks", "wait_command")
    
    g.add_conditional_edges(
        "wait_command",
        route_after_wait_command,
        {"ask_update": "ask_update", "prompt_for_start": "prompt_for_start", END: END}
    )
    g.add_edge("prompt_for_start", "wait_command")

    # After asking or collecting, the graph run must END.
    g.add_edge("ask_update", END)
    g.add_edge("collecting", END)

    # This branch is ONLY triggered by the bot's self-initiated second run.
    g.add_conditional_edges(
        "should_continue_router",
        should_continue,
        {"ask_update": "ask_update", "summary": "summary"}
    )

    g.add_edge("summary", END)

    return g.compile()

scrum_graph = build_scrum_graph()