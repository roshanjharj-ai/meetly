from gtts import gTTS
import io
import requests 
# ==============================================================================
# CLASS 3: Text-to-Speech Converter
# ==============================================================================
class TextToSpeechConverter:
    def convert(self, text_response: str) -> bytes | None:
        """Synchronous method to generate audio from text."""
        if not text_response:
            return None
        print(f"🔊 Generating audio for: '{text_response}'")
        try:
            tts = gTTS(text=text_response, lang='en', tld='com.au')
            audio_fp = io.BytesIO()
            tts.write_to_fp(audio_fp)
            audio_fp.seek(0)
            print("✅ Audio generated successfully.")
            return audio_fp.read()
        # ⭐ FIX: Catch specific network errors from gTTS's underlying library (requests)
        except requests.exceptions.RequestException as e:
            print(f"❌ NETWORK ERROR during TTS generation: Could not connect to Google's servers.")
            print(f"   Please check your internet connection, firewall, or proxy settings.")
            print(f"   Details: {e}")
            return None
        except Exception as e:
            print(f"❌ An unknown error occurred during TTS conversion: {e}")
            return None