#!/bin/bash
echo "🚀 Starting Virtual Listener bot..."

cd /home/site/wwwroot/ai

# Ensure Python virtual environment is activated if Oryx created one
if [ -d "/antenv" ]; then
  echo "Activating Azure virtual environment..."
  source /antenv/bin/activate
fi

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Set the WebSocket URL here
WS_SERVER="wss://YOUR_WEBSOCKET_SERVER_URL/ws"
ROOM="myroom"
BOT_NAME="Jarvis"

echo "Connecting to server: $WS_SERVER"
python3 main.py --room "$ROOM" --name "$BOT_NAME" --server "$WS_SERVER"
