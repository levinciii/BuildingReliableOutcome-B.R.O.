"""Mouth: speaks replies with your computer's built-in voice (offline, free)."""
import re


def clean_for_speech(text, max_chars=700):
    """Remove things that sound bad read aloud: code blocks, markdown, links. Keep it short."""
    text = re.sub(r"```.*?```", " The code is on your screen. ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"https?://\S+", "a link", text)
    text = re.sub(r"[#*_>|]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if max_chars and len(text) > max_chars:
        cut = text[:max_chars]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
        cut = cut[:end + 1] if end > max_chars // 2 else cut.rsplit(" ", 1)[0]
        text = cut + " The rest is on your screen."
    return text


class Speaker:
    def __init__(self, rate=185, max_chars=700):
        import pyttsx3  # imported here so --mute mode works without it
        self._pyttsx3 = pyttsx3
        self.rate = rate
        self.max_chars = max_chars

    def speak(self, text):
        spoken = clean_for_speech(text, self.max_chars)
        if not spoken:
            return
        # A fresh engine per call avoids a known pyttsx3 hang on repeated use.
        engine = self._pyttsx3.init()
        engine.setProperty("rate", self.rate)
        engine.say(spoken)
        engine.runAndWait()
        engine.stop()
