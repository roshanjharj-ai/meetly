import tempfile
from gtts import gTTS
import shutil
import subprocess   
import os

class TextToSpeechConverter:
    def convert_get_file(self, text: str) -> str:
        tts = gTTS(text=text, lang="en")
        tmp_mp3 = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tts.save(tmp_mp3.name)

        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            print("⚠️ ffmpeg not found – sending MP3 directly")
            return tmp_mp3.name

        tmp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        subprocess.run([
            ffmpeg_path, "-y", "-i", tmp_mp3.name,
            "-ar", "16000", "-ac", "1", tmp_wav.name
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.remove(tmp_mp3.name)
        return tmp_wav.name
