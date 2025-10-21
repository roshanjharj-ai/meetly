# recording_manager.py
import os
import asyncio
import os
import time
import asyncio
import wave
from typing import Optional
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import AzureError
import numpy as np

class RecordingManager:
    def __init__(self, output_dir="recordings", ffmpeg_path="ffmpeg"):
        self.output_dir = output_dir
        self.ffmpeg_path = ffmpeg_path
        self.is_recording = False
        os.makedirs(self.output_dir, exist_ok=True)
        self.active_recordings = {}
        # ... Azure config ...

    def start_recording(self):
        if not self.is_recording:
            print("[Recorder] ▶️ Recording session started.")
            self.is_recording = True

    async def stop_recording_and_compose(self) -> str:
        """
        Gracefully stop recording, wait for FFmpeg subprocesses, mix audio,
        compose final video and return path (or error string).
        """
        if not self.is_recording:
            return "No recording was active."

        print("[Recorder] ⏹️ Waiting for FFmpeg processes to finalize...")
        self.is_recording = False

        try:
            # Collect ffmpeg processes from active_recordings
            processes = []
            for user_data in list(self.active_recordings.values()):
                for track_data in list(user_data.values()):
                    proc = track_data.get("process")
                    if proc:
                        processes.append(proc)

            # Wait for all ffmpeg processes to exit (with timeout fallback)
            for proc in processes:
                try:
                    # if process still running, await completion
                    if proc.returncode is None:
                        await proc.wait()
                except Exception as e:
                    print(f"[Recorder] ⚠️ Error while waiting for ffmpeg proc: {e}")
                    
            for proc in processes:
                try:
                    if proc.stdin and not proc.stdin.is_closing():
                        proc.stdin.close()
                except Exception:
                    pass

            # Gather recorded filenames (ensure files exist & not trivially small)
            audio_files = []
            video_files = []
            for u in self.active_recordings.values():
                for t, rec in u.items():
                    fname = rec.get("filename")
                    if not fname:
                        continue
                    if "audio" in t:
                        if os.path.exists(fname) and os.path.getsize(fname) > 44:
                            audio_files.append(fname)
                    else:
                        if os.path.exists(fname) and os.path.getsize(fname) > 1024:
                            video_files.append(fname)

            # Clear active recordings map now (we already copied filenames)
            self.active_recordings.clear()

            if not audio_files:
                print("[Recorder] ⚠️ No valid audio files found.")
            if not video_files:
                print("[Recorder] ⚠️ No valid video files found.")

            if not audio_files and not video_files:
                return "Recording failed: No usable audio or video files captured."

            # Merge audio (if multiple)
            mixed_audio_path = None
            if audio_files:
                mixed_audio_path = await self._merge_audio_tracks(audio_files)
                if not mixed_audio_path:
                    return "Recording failed: Could not mix audio tracks."

            # Compose final video if we have video + audio
            final_output_path = None
            if video_files:
                # If there's no mixed_audio_path, ffmpeg can try to use first audio file (best-effort)
                audio_for_compose = mixed_audio_path if mixed_audio_path else (audio_files[0] if audio_files else None)
                final_output_path = await self._compose_video(video_files, audio_for_compose) if audio_for_compose else await self._compose_video(video_files, None)

            # Clean up intermediate files (keep final_output_path)
            cleanup_files = []
            cleanup_files.extend(audio_files)
            cleanup_files.extend(video_files)
            if mixed_audio_path and mixed_audio_path not in cleanup_files:
                cleanup_files.append(mixed_audio_path)

            for f in cleanup_files:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                except Exception:
                    pass

            if final_output_path:
                # optionally upload to azure (kept as your previous logic)
                if os.getenv("AZURE_STORAGE_CONNECTION_STRING"):
                    try:
                        await self._upload_to_azure(final_output_path)
                    except Exception as e:
                        print(f"[Recorder] ⚠️ Azure upload failed: {e}")
                return final_output_path

            return "Composition failed."

        except Exception as e:
            # catch-all to avoid 500 internal server error
            print(f"[Recorder] ❌ stop_recording_and_compose raised: {type(e).__name__} - {e}")
            return f"Internal error during finalize: {type(e).__name__}: {e}"


    async def add_audio_track(self, track, room_id, user_id):
        """
        Start recording an aiortc Audio track into a proper WAV file (PCM 16-bit).
        This writes a well-formed WAV using Python's wave module to avoid
        ffmpeg stdin format mismatches that cause noise/corruption.

        Behavior:
        - Waits for first frame (short timeout) to detect sample rate & channels.
        - Converts float32/float64 -> int16 (PCM) reliably.
        - Writes interleaved frames for multi-channel audio.
        - Stores metadata in self.active_recordings[user_id]["audio"] = {"filename": filename}
        - Runs as an asyncio task and returns immediately.
        """
        if not self.is_recording:
            return

        if user_id not in self.active_recordings:
            self.active_recordings[user_id] = {}

        filename = os.path.join(self.output_dir, f"{user_id}_{int(time.time())}_audio.wav")

        async def _writer():
            wav_file: Optional[wave.Wave_write] = None
            try:
                # Wait for first frame (short wait). If none received, bail out.
                try:
                    first_frame = await asyncio.wait_for(track.recv(), timeout=4.0)
                except asyncio.TimeoutError:
                    print(f"[Recorder] ⚠️ Timed out waiting for first audio frame for {user_id}")
                    return

                # Inspect ndarray returned by AudioFrame.to_ndarray()
                samples = first_frame.to_ndarray()
                # Try to detect sample rate from frame if attribute exists; otherwise fallback
                sample_rate = getattr(first_frame, "sample_rate", 48000)
                # Determine channels
                if getattr(samples, "ndim", 1) == 1:
                    # shape (n,) -> mono
                    channels = 1
                    num_samples = samples.shape[0]
                    interleaved = samples
                else:
                    # Could be (channels, n) or (n, channels) — detect which
                    if samples.shape[0] <= 8 and samples.shape[0] < samples.shape[1]:
                        # treat as (channels, n)
                        channels = samples.shape[0]
                        num_samples = samples.shape[1]
                        interleaved_arr = samples.T  # (n, channels)
                    else:
                        # treat as (n, channels)
                        channels = samples.shape[1]
                        num_samples = samples.shape[0]
                        interleaved_arr = samples

                    # flatten to interleaved 1D if needed
                    interleaved = interleaved_arr.reshape(-1)

                # Convert to int16 PCM
                def to_int16_array(arr: np.ndarray) -> np.ndarray:
                    if arr.dtype in (np.float32, np.float64):
                        clamped = np.clip(arr, -1.0, 1.0)
                        return (clamped * 32767.0).astype(np.int16)
                    if arr.dtype == np.int32:
                        return (arr >> 16).astype(np.int16)
                    if arr.dtype == np.uint8:
                        # unsigned 8-bit -> center to 0 and scale
                        return (((arr.astype(np.int16) - 128) << 8)).astype(np.int16)
                    return arr.astype(np.int16)

                s16 = to_int16_array(interleaved)

                # Create wave file with detected parameters
                wav_file = wave.open(filename, "wb")
                wav_file.setnchannels(channels)
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(int(sample_rate))

                # Write first frame
                wav_file.writeframesraw(s16.tobytes())

                # Store reference (process not used here, we store filename only).
                self.active_recordings[user_id]["audio"] = {"filename": filename}

                # Continue receiving frames and append
                while True:
                    try:
                        frame = await track.recv()
                    except Exception as e:
                        # remote closed track or other error -> break loop
                        print(f"[Recorder] Pipe for audio track {getattr(track, 'id', '?')} ended: {type(e).__name__} {e}")
                        break

                    samples = frame.to_ndarray()
                    # Normalize shape to interleaved 1D array
                    if getattr(samples, "ndim", 1) == 1:
                        interleaved = samples
                    else:
                        if samples.shape[0] <= 8 and samples.shape[0] < samples.shape[1]:
                            interleaved_arr = samples.T
                        else:
                            interleaved_arr = samples
                        interleaved = interleaved_arr.reshape(-1)

                    s16 = to_int16_array(interleaved)
                    # Optionally: pacing could be added, but wav writing is append-only, we don't sleep here.
                    # Write frames raw to file
                    wav_file.writeframesraw(s16.tobytes())

            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"[Recorder] ❌ Error in audio writer for {user_id}: {type(e).__name__} {e}")
            finally:
                if wav_file is not None:
                    try:
                        # finalize headers by calling close (writeframesraw needs close to finalize file)
                        wav_file.close()
                    except Exception:
                        pass

        # Launch writer as background task (non-blocking)
        asyncio.create_task(_writer())

    async def add_video_track(self, track, room_id, user_id, track_type: str | None = None):
            """
            Start recording a video track into its own file. `track_type` can be 'camera' or 'screenshare'.
            If not provided, we heuristically decide via track.label or the number of existing video tracks.
            """
            if not self.is_recording:
                return

            if user_id not in self.active_recordings:
                self.active_recordings[user_id] = {}

            # Heuristics for track_type
            label = getattr(track, "label", "") or ""
            lbl = label.lower()
            if not track_type:
                if "screen" in lbl or "display" in lbl or "share" in lbl:
                    track_type = "screenshare"
                else:
                    # if user already has a camera video track stored, treat this as screenshare
                    user_videos = [k for k in self.active_recordings[user_id].keys() if k.startswith("video_") or k.startswith("camera_")]
                    if user_videos:
                        track_type = "screenshare"
                    else:
                        track_type = "camera"

            track_key = f"{track_type}_{track.id}"
            filename = os.path.join(self.output_dir, f"{user_id}_{track_key}.mkv")

            # store placeholder now to avoid race (so future arrivals know one exists)
            self.active_recordings[user_id][track_key] = {"filename": filename, "process": None}

            # start the actual recording task
            asyncio.create_task(self._start_video_recording_dynamic(track, user_id, track_key, filename))


    async def _start_video_recording_dynamic(self, track, user_id, track_key, filename):
        try:
            first_frame = await asyncio.wait_for(track.recv(), timeout=5.0)
            width, height = first_frame.width, first_frame.height
            command = [self.ffmpeg_path, "-y", "-use_wallclock_as_timestamps", "1", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{width}x{height}", "-r", "24", "-i", "pipe:0", "-c:v", "libx264", "-preset", "ultrafast", filename]
            process = await asyncio.create_subprocess_exec(*command, stdin=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            self.active_recordings[user_id][track_key] = {"process": process, "filename": filename}
            await self._pipe_media_to_ffmpeg(track, process, first_frame)
        except asyncio.TimeoutError: print(f"⚠️ Timed out waiting for video frame for {user_id}")

    async def _pipe_media_to_ffmpeg(self, track, process, first_frame=None):
        """
        Pipe video frames to an ffmpeg subprocess via stdin.
        Assumes ffmpeg process is configured to read rawvideo with yuv420p, matching the
        width/height determined from the first frame.
        The function:
        - Converts frames to yuv420p ndarray bytes.
        - Uses frame.time for pacing (sleep delta) to avoid overfeeding.
        - Handles BrokenPipe gracefully and closes stdin at the end.
        Note: this function is intended for video tracks only. Audio is handled by add_audio_track (WAV writer).
        """
        start_time = time.time()
        last_pts = None

        async def write_video_frame(frame):
            nonlocal last_pts
            # pacing using frame.time (seconds) if available
            if hasattr(frame, "time") and isinstance(frame.time, (float, int)):
                pts = frame.time
                if last_pts is not None:
                    delta = pts - last_pts
                    if 0 < delta < 1.0:
                        await asyncio.sleep(delta)
                last_pts = pts

            # Convert to yuv420p ndarray and bytes. aiortc VideoFrame.to_ndarray accepts format argu.
            arr = frame.to_ndarray(format="yuv420p")  # shape (h*1.5? etc) -> bytes
            data = arr.tobytes()

            # write into ffmpeg stdin
            if process.stdin and not process.stdin.is_closing():
                try:
                    process.stdin.write(data)
                    await process.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    print(f"[Recorder] ⚠️ FFmpeg stdin closed for video track {getattr(track, 'id', 'unknown')}")
                    raise
                except Exception as e:
                    print(f"[Recorder] ⚠️ Error writing video frame to ffmpeg stdin: {e}")
                    raise

        try:
            if first_frame is not None:
                await write_video_frame(first_frame)

            while True:
                frame = await track.recv()
                await write_video_frame(frame)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Pipe for track {getattr(track, 'id', 'unknown')} finished: {type(e).__name__} ({e})")
        finally:
            # Ensure ffmpeg stdin is closed so ffmpeg can finish
            try:
                if process.stdin and not process.stdin.is_closing():
                    process.stdin.close()
            except Exception:
                pass


    async def _merge_audio_tracks(self, audio_files: list[str]) -> str | None:
        """
        Mixes multiple audio files into a single WAV (48k, stereo, pcm_s16le).
        Returns path or None on failure.
        """
        if not audio_files:
            print("[Recorder] ⚠️ No audio files found to merge.")
            return None

        if len(audio_files) == 1:
            print(f"[Recorder] 🎧 Single audio track found: {audio_files[0]}")
            return audio_files[0]

        output_path = os.path.join(self.output_dir, f"mixed_audio_{int(time.time())}.wav")

        command = [self.ffmpeg_path, "-y", "-loglevel", "debug"]
        for f in audio_files:
            command.extend(["-i", f])

        filter_complex = f"amix=inputs={len(audio_files)}:duration=longest:dropout_transition=2,aresample=async=1"

        command.extend([
            "-filter_complex", filter_complex,
            "-ac", "2",
            "-ar", "48000",
            "-c:a", "pcm_s16le",
            output_path
        ])

        print("[Recorder] 🎚️ Mixing multiple audio tracks...")
        proc = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        _, stderr = await proc.communicate()

        if proc.returncode == 0:
            print(f"[Recorder] ✅ Audio mix complete: {output_path}")
            return output_path
        else:
            print(f"[Recorder] ❌ Audio mix failed. FFmpeg error:\n{stderr.decode()}")
            return None


    async def _compose_video(self, video_files: list[str], audio_path: str | None) -> str | None:
        """
        Combine video files and an optional audio track into a final MP4 file.
        If audio_path is None, compose video-only output (no map for audio).
        """
        if not video_files:
            print("[Recorder] ⚠️ No video files found to compose.")
            return None

        output_path = os.path.join(self.output_dir, f"final_recording_{int(time.time())}.mp4")
        num_videos = len(video_files)

        print(f"[Recorder] 🎬 Starting final composition with {num_videos} video(s)...")

        command = [self.ffmpeg_path, "-y", "-loglevel", "debug"]
        for f in video_files:
            command.extend(["-i", f])
        if audio_path:
            command.extend(["-i", audio_path])

        filter_complex_parts = []
        for i in range(num_videos):
            filter_complex_parts.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}];")

        if audio_path:
            filter_complex_parts.append(f"[{num_videos}:a]aresample=async=1,asetpts=PTS-STARTPTS[aout];")

        # layout logic
        if num_videos == 1:
            filter_complex_parts.append("[v0]scale=1920:1080:force_original_aspect_ratio=decrease,setsar=1[vout];")
        elif num_videos == 2:
            filter_complex_parts.extend([
                "[v0]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2[left];",
                "[v1]scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080:(ow-iw)/2:(oh-ih)/2[right];",
                "[left][right]hstack=inputs=2[vout];"
            ])
        else:
            grid_cols = math.ceil(math.sqrt(num_videos))
            grid_rows = math.ceil(num_videos / grid_cols)
            canvas_w, canvas_h = 1920, 1080
            tile_w, tile_h = canvas_w // grid_cols, canvas_h // grid_rows
            scaled_outputs = []
            for i in range(num_videos):
                filter_complex_parts.append(
                    f"[v{i}]scale={tile_w}:{tile_h}:force_original_aspect_ratio=decrease,"
                    f"pad={tile_w}:{tile_h}:(ow-iw)/2:(oh-ih)/2,setsar=1[s{i}];"
                )
                scaled_outputs.append(f"[s{i}]")
            layout = ":".join([f"x{i % grid_cols}*w:y{i // grid_cols}*h" for i in range(num_videos)])
            filter_complex_parts.append(f"{''.join(scaled_outputs)}xstack=inputs={num_videos}:layout={layout}[vout]")

        # Build command
        cmd_filters = "".join(filter_complex_parts)
        command.extend(["-filter_complex", cmd_filters, "-map", "[vout]"])
        if audio_path:
            command.extend(["-map", "[aout]"])
            command.extend(["-c:a", "aac", "-b:a", "192k"])
        else:
            # no audio; ensure container has no audio stream
            pass

        command.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-shortest", output_path])

        print("[Recorder] ⚙️ Running synchronized A/V composition...")
        proc = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            _, stderr = await proc.communicate()
            print("[Recorder] ❌ FFmpeg composition timeout – killed process.")
            return None

        if proc.returncode == 0:
            print(f"[Recorder] ✅ Composition successful: {output_path}")
            return output_path
        else:
            print(f"[Recorder] ❌ Composition failed. FFmpeg error:\n{stderr.decode()}")
            return None



    async def _upload_to_azure(self, file_path: str) -> str | None:
        blob_name = os.path.basename(file_path)
        print(f"☁️ Uploading {blob_name} to Azure...")
        try:
            blob_service_client = BlobServiceClient.from_connection_string(self.azure_connection_string)
            blob_client = blob_service_client.get_blob_client(container=self.azure_container_name, blob=blob_name)
            with open(file_path, "rb") as data: await blob_client.upload_blob(data, overwrite=True)
            print(f"✅ Upload successful. URL: {blob_client.url}"); return blob_client.url
        except AzureError as e: print(f"❌ Azure upload failed: {e}"); return None