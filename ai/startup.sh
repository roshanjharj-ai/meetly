#!/bin/bash
set -e

echo "🚀 Starting Virtual Listener Bot..."

# Navigate to your app directory (adjust if needed)
cd ai

# Print current directory for debugging
pwd

# Optional: show Python version and list files
python --version
ls -l

# Run your bot
python main.py --room "aiRoom" --name "Jocker" --server "wss://meetly-server-bkhgbua4gwf4hrcb.canadacentral-01.azurewebsites.net/ws"
