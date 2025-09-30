import google.generativeai as genai
import os

from dotenv import load_dotenv

load_dotenv()

class AIResponder:
    """Generates a text response using the Gemini AI model."""
    def __init__(self):
        api_key=os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Google API Key not found. Please set the GOOGLE_API_KEY environment variable.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')
        self.chat = self.model.start_chat(history=[]) # Start a chat to maintain context
        print("♊️ Gemini Responder initialized.")

    async def generate_response(self, text_input: str) -> str | None:
        """Asynchronously generates a response from the user's text."""
        print(f"💬 Sending to Gemini: '{text_input}'")
        try:
            # Using the async method of the SDK
            response = await self.chat.send_message_async(
                f"You are a helpful meeting assistant. The user said: '{text_input}'. Respond concisely."
            )
            response_text = response.text.strip()
            print(f"🤖 Gemini responded: '{response_text}'")
            return response_text
        except Exception as e:
            print(f"⚠️ Error from Gemini API: {e}")
            return "I'm sorry, I'm having trouble connecting to my brain right now."