"""Ears: keeps the microphone open, detects when you speak, and turns speech into text locally."""
import time
from collections import deque

import numpy as np

SAMPLE_RATE = 16000
CHUNK_SECONDS = 0.1
CHUNK_FRAMES = int(SAMPLE_RATE * CHUNK_SECONDS)
MIN_SPEECH_SECONDS = 0.4  # shorter sounds (clicks, coughs) are ignored
START_CHUNKS = 2          # this many loud chunks in a row = speech has started
PROMPT_HINT = "Hey bro, B.R.O. A voice assistant for coding. Python, function, file, project."


def rms(chunk):
    return float(np.sqrt(np.mean(np.square(chunk))))


class Listener:
    def __init__(self, model_name="base.en", audio=None):
        audio = audio or {}
        self.device = audio.get("input_device")
        self.silence_seconds = float(audio.get("silence_seconds", 1.1))
        self.floor = float(audio.get("silence_threshold", 0.012))
        self.max_seconds = float(audio.get("max_record_seconds", 30))
        self.threshold = self.floor
        self.stream = None
        from faster_whisper import WhisperModel  # imported here so --text mode works without it
        print(f"Loading speech model '{model_name}' (first run downloads it)...")
        self.model = WhisperModel(model_name, device="cpu", compute_type="int8")

    # ----- microphone stream
    def _ensure_stream(self):
        if self.stream is None:
            import sounddevice as sd
            self.stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                         blocksize=CHUNK_FRAMES, device=self.device)
            self.stream.start()

    def close(self):
        if self.stream is not None:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None

    def _read_chunk(self):
        data, _overflowed = self.stream.read(CHUNK_FRAMES)
        return np.asarray(data)[:, 0].copy()

    def flush(self):
        """Throw away audio that piled up while B.R.O. was talking, so it never hears itself."""
        self._ensure_stream()
        try:
            waiting = int(self.stream.read_available)
            if waiting > 0:
                self.stream.read(waiting)
        except Exception:
            pass

    def calibrate(self, seconds=1.0):
        """Measure the room's background noise and set the speech threshold above it."""
        self._ensure_stream()
        levels = [rms(self._read_chunk()) for _ in range(max(1, int(seconds / CHUNK_SECONDS)))]
        ambient = float(np.percentile(levels, 80))
        self.threshold = max(self.floor, min(ambient * 3.0, 0.08))
        return ambient, self.threshold

    # ----- recording one sentence
    def record(self, wait_seconds=None):
        """Wait for speech, record until you pause. None if nobody spoke within wait_seconds."""
        self._ensure_stream()
        pre = deque(maxlen=START_CHUNKS + 3)  # a little audio from before the speech was detected
        frames, started, loud_run, quiet_run, waited = [], False, 0, 0, 0.0
        quiet_limit = max(1, round(self.silence_seconds / CHUNK_SECONDS))
        max_chunks = int(self.max_seconds / CHUNK_SECONDS)

        while True:
            chunk = self._read_chunk()
            level = rms(chunk)
            if not started:
                pre.append(chunk)
                loud_run = loud_run + 1 if level > self.threshold else 0
                if loud_run >= START_CHUNKS:
                    started = True
                    frames = list(pre)
                else:
                    waited += CHUNK_SECONDS
                    if wait_seconds is not None and waited >= wait_seconds:
                        return None
            else:
                frames.append(chunk)
                quiet_run = quiet_run + 1 if level < self.threshold * 0.8 else 0
                if quiet_run >= quiet_limit or len(frames) >= max_chunks:
                    break

        speech_seconds = (len(frames) - quiet_run) * CHUNK_SECONDS
        if speech_seconds < MIN_SPEECH_SECONDS:
            return None
        return np.concatenate(frames)

    def transcribe(self, audio):
        segments, _ = self.model.transcribe(
            audio, language="en", vad_filter=True, beam_size=1,
            condition_on_previous_text=False, initial_prompt=PROMPT_HINT,
        )
        return " ".join(s.text.strip() for s in segments).strip()

    def listen(self, wait_seconds=None):
        audio = self.record(wait_seconds)
        return self.transcribe(audio) if audio is not None else ""


def list_microphones():
    import sounddevice as sd
    lines = []
    for i, d in enumerate(sd.query_devices()):
        if d.get("max_input_channels", 0) > 0:
            lines.append(f"  {i}: {d['name']}")
    return lines


def pause_for_echo(seconds=0.3):
    time.sleep(seconds)
