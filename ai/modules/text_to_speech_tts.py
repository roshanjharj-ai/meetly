import tempfile
import os
from TTS.api import TTS

class TextToSpeechConverterTTS:
    def __init__(self):
        # Load a realistic free English voice model (you can change voice later)
        self.tts = TTS("tts_models/en/ljspeech/tacotron2-DDC_ph", progress_bar=False, gpu=False)

    def convert_get_file(self, text: str) -> str:
        # Create a temp WAV file
        tmp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        
        # Generate realistic voice
        self.tts.tts_to_file(text=text, file_path=tmp_wav.name)
        
        print(f"🎤 Generated speech ({len(text.split())} words) → {tmp_wav.name}")
        return tmp_wav.name
