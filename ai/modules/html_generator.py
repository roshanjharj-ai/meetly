from jinja2 import Template

class HTMLGenerator:
    def __init__(self):
        with open("./templates/task_details_template.html") as f:
            self.task_details_template = Template(f.read())
            
        with open("./templates/task_list_template.html") as f:
            self.task_list_template = Template(f.read())
    
    def GetTasksList(self, title, tasks):
        html = self.task_list_template.render(title=title, tasks=tasks)
        return html
    
    
    def GetTaskDetails(self, task):
        html = self.task_details_template.render(task=task)
        return html
    
    def GetMeetingSummary(self, tasks):
        html = "<div><h3>Meeting Summary</h3><ul>"
        for t in tasks:
            comments = "<br/>".join(t.get("comments", [])) if t.get("comments") else "No updates"
            html += f"<li>{t['title']} ({t['status']}) — {comments}</li>"
        html += "</ul></div>"
        return html