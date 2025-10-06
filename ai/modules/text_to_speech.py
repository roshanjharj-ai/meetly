import tempfile
from gtts import gTTS


class TextToSpeechConverter:
    def convert_get_file(self, text: str) -> str:
        tts = gTTS(text=text, lang="en")
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tts.save(tmp_file.name)
        return tmp_file.name
