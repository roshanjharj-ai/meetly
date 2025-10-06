#!/bin/bash
echo "🚀 Starting Jarvis bot..."

# Activate virtual environment if present
if [ -d "antenv" ]; then
    source antenv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# Move into app directory (adjust if your code is under /ai or /app)
cd /home/site/wwwroot/ai || cd /home/site/wwwroot || exit 1

# Run your bot with full arguments
python main.py \
  --room myroom \
  --name Jarvis \
  --server wss://meetly-server-bkhgbua4gwf4hrcb.canadacentral-01.azurewebsites.net/ws

echo "✅ Bot started and connected to WebSocket"
