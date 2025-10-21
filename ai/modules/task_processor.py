class TaskProcessor:
    def __init__(self):
        self.sample_task = {
    "title": "Create UI For the feature",
    "status": "InProgress",
    "owner": "Roshan Kumar Jha",
    "owner_initials": "A",
    "description": "Complete UI in react with the help of Mock UI Shared by Lee in Figma.",
    "start_date": "2025-10-01",
    "expected_completion": "2025-10-09",
    "planned_completion": "2025-10-07",
    "estimated": 16,
    "completed": 18,
    "remaining": 0,
    "due_date": "2025-10-07",
    "is_overdue": False,
    "comments": [
        {"comment": "Shared Figma URL.", "commented_by": "Lee", "time": "09:15 AM"},
        {"comment": "Looks Good and Good to go.", "commented_by": "Naman", "time": "10:05 AM"},
        {"comment": "Completed UI development reviewed by Santosh and deployed in QA.", "commented_by": "Roshan", "time": "10:45 AM"},
        {"comment": "This task will be sent for Testing.", "commented_by": "Bot", "time": "12:45 AM"},
    ],
}
        
        self.tasks = [
    {
        "title": "Create Database structure",
        "status": "InProgress",
        "owner": "Santosh Police Patil",
        "owner_initials": "A",
        "due_date": "2025-10-10",
        "is_overdue": False,
    },
    {
        "title": "Create API For DB",
        "status": "Stuck",
        "owner": "Santosh PP",
        "owner_initials": "B",
        "due_date": "2025-10-05",
        "is_overdue": True,
    },
    {
        "title": "Create UI For the feature",
        "status": "Complete",
        "owner": "Roshan Kumar Jha",
        "owner_initials": "C",
        "due_date": "2025-10-07",
        "is_overdue": False,
    },
]
        
    def GetTodaysTasks(self):
        return self.tasks
    
    
    def GetTaskDetails(self, taskId):
        return self.sample_task