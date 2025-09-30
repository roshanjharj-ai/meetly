import speech_recognition as sr
from pydub import AudioSegment,utils
import os
import io

# ⭐ FIX: Build a robust path relative to THIS script file
# Get the absolute directory path where this script is located.
script_dir = os.path.dirname(os.path.abspath(__file__))

# Join this script's directory path with the relative path to the executables.
ffmpeg_path = os.path.join(script_dir, "bin", "ffmpeg.exe")
ffprobe_path = os.path.join(script_dir, "bin", "ffprobe.exe")

# Set the paths for pydub to use, but only if the files exist.
if os.path.exists(ffmpeg_path) and os.path.exists(ffprobe_path):
    utils.get_prober_name = lambda: ffprobe_path
    AudioSegment.converter = ffmpeg_path
    print(f"✅ Set FFmpeg path to: {ffmpeg_path}")
else:
    print("⚠️ WARNING: FFmpeg executables not found at the expected location.")
    print("Please ensure the 'bin' folder with ffmpeg.exe is next to this script.")
# ⭐ END FIX

class SpeechToTextConverter:
    """Handles the conversion of raw audio bytes to text using Whisper."""
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 1000
        self.recognizer.dynamic_energy_threshold = False

    def convert(self, audio_buffer: bytearray) -> str | None:
        """
        Synchronous method to transcribe audio.
        Returns the transcribed text or None if understanding fails.
        """
        if not audio_buffer:
            return None
        
        print("🎤 Processing audio for transcription...")
        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(bytes(audio_buffer)))
            audio_data = sr.AudioData(
                audio_segment.raw_data,
                audio_segment.frame_rate,
                audio_segment.sample_width
            )
            recognized_text = self.recognizer.recognize_whisper(
                audio_data, model="base.en"
            ).strip().lower()

            if recognized_text and recognized_text != ".":
                print(f"🧐 Recognized: '{recognized_text}'")
                return recognized_text
            return None
        except sr.UnknownValueError:
            print("🤫 Could not understand the audio.")
            return None
        except Exception as e:
            print(f"⚠️ Error during STT conversion: {e}")
            return None