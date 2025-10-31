import os
import tempfile
from typing import Optional

from gtts import gTTS

# Optional WAV conversion via pydub if ffmpeg is available
_FFMPEG_BIN = os.environ.get("FFMPEG_BINARY")  # e.g., set to your ffmpeg path
_try_wav = False

try:
    from pydub import AudioSegment
    if _FFMPEG_BIN:
        AudioSegment.converter = _FFMPEG_BIN  # direct path
        _try_wav = True
    else:
        # pydub will still try system ffmpeg if present
        _try_wav = True
except Exception:
    _try_wav = False


class TextToSpeechConverter:
    """
    Returns a path to an audio file containing spoken 'text'.
    - If ffmpeg is available: prefer WAV (PCM 16-bit)
    - Otherwise: return MP3 (what gTTS natively produces)
    """

    def convert_get_file(self, text: str) -> Optional[str]:
        text = (text or "").strip()
        if not text:
            return None

        # First create MP3 via gTTS
        mp3_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tts = gTTS(text=text, lang="en")
        tts.save(mp3_tmp.name)

        # If ffmpeg/pydub is available, convert to WAV (preferred)
        if _try_wav:
            try:
                audio = AudioSegment.from_file(mp3_tmp.name, format="mp3")
                wav_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
                audio.export(wav_tmp.name, format="wav")
                return wav_tmp.name
            except Exception:
                # Fall back to MP3
                return mp3_tmp.name

        # No ffmpeg → MP3 is fine; the caller will label format = mp3
        return mp3_tmp.name
