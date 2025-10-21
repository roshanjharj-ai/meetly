from dataclasses import dataclass
from modules.task_processor import TaskProcessor
from modules.html_generator import HTMLGenerator

@dataclass
class ProcessedResponse:
    speach: str
    html: str

class TextProcessor:
    
    def __init__(self):
        self.taskProcessor = TaskProcessor()
        self.htmlGenerator = HTMLGenerator()
    
    async def generate_reply(self, text: str, speaker_name: str = "Unknown") -> ProcessedResponse:
        # Placeholder logic, replace with ML/LLM pipeline
        t = text.lower()
        if "hello" in t:
            return ProcessedResponse("Hello there!", "")
        if "task list" in t:
            list = self.taskProcessor.GetTodaysTasks()
            html = self.htmlGenerator.GetTasksList("Today's tasks", list)
            return ProcessedResponse("Here is the list of todays tasks", html)
        if "task detail" in t:
            task = self.taskProcessor.GetTaskDetails(1)
            html = self.htmlGenerator.GetTaskDetails(task)
            return ProcessedResponse("I have opened the details for you", html)
        if "how are you" in t:
            return ProcessedResponse("I'm great, thanks for asking!","")
        return ProcessedResponse(f"You said: {text}","")
    
    async def UserInit(self, user, userList)-> ProcessedResponse:
        list = self.taskProcessor.GetTodaysTasks()
        html = self.htmlGenerator.GetTasksList("Today's tasks", list)
        return ProcessedResponse(f"Welcome {user} I lets start with tasks", html)
