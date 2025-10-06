import base64
import io
from pydub import AudioSegment


def resample_and_encode_wav(pcm_bytes: bytes, original_rate: int, target_rate: int) -> bytes:
    if not pcm_bytes:
        return b""
    try:
        audio_segment = AudioSegment(
            data=pcm_bytes,
            sample_width=2,
            frame_rate=original_rate,
            channels=1
        )
        resampled_segment = audio_segment.set_frame_rate(target_rate)
        with io.BytesIO() as wav_io:
            resampled_segment.export(wav_io, format="wav")
            return wav_io.getvalue()
    except Exception as e:
        print(f"Error in audio resampling: {e}")
        return b""


def wav_to_base64(wav_path: str) -> str:
    with open(wav_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")
