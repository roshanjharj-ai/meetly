import io
import speech_recognition as sr
from core.audio_utils import resample_and_encode_wav


class SpeechToTextConverter:
    async def transcribe(self, pcm_bytes: bytes, sample_rate: int) -> str | None:
        wav_bytes = resample_and_encode_wav(pcm_bytes, sample_rate, 16000)
        recognizer = sr.Recognizer()
        with sr.AudioFile(io.BytesIO(wav_bytes)) as source:
            audio = recognizer.record(source)
        try:
            return recognizer.recognize_google(audio)
        except sr.UnknownValueError:
            return None
        except Exception as e:
            print(f"[STT] Error: {e}")
            return None
