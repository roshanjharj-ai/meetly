#!/bin/bash
apt-get update && apt-get install -y ffmpeg
export PYTHONPATH=/home/site/wwwroot/ai:/home/site/wwwroot

echo "🚀 Starting Jarvis bot..."
python3 web/main.py &  # <-- your bot
# Dummy HTTP server so Azure thinks something is running
python3 -m http.server 8000
