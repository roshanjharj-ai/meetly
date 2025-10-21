class ADOProjectManager:
    def __init__(self):
        self.sample_task = {
    "id": 1,
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
        "id": 1,
        "title": "Create Database structure",
        "status": "InProgress",
        "owner": "Roshan",
        "owner_initials": "A",
        "due_date": "2025-10-10",
        "is_overdue": False,
        "estimated": 12,
        "completed": 2,
        "remaining": 10,
    },
    {
        "id": 2,
        "title": "Create API For DB",
        "status": "Stuck",
        "owner": "Roshan",
        "owner_initials": "B",
        "due_date": "2025-10-05",
        "is_overdue": True,
        "estimated": 16,
        "completed": 16,
        "remaining": 2,
    },
    {
        "id": 3,
        "title": "Create UI For the feature",
        "status": "Complete",
        "owner": "Roshan",
        "owner_initials": "C",
        "due_date": "2025-10-07",
        "is_overdue": False,
        "estimated": 12,
        "completed": 12,
        "remaining": 0,
    },
]

    async def list_tasks(self):
        return self.tasks

    def update_task_status(self, task_id, status):
        for t in self.tasks:
            if t["id"] == task_id:
                t["status"] = status
                return True
        return False

    def add_comment(self, task_id, comment):
        for t in self.tasks:
            if t["id"] == task_id:
                t.setdefault("comments", []).append(comment)
                return True
        return False
