"""Wake-word detection on transcribed text (no extra libraries needed)."""
import re

HALLUCINATIONS = {
    "you", "thank you", "thanks", "thanks for watching", "thank you for watching", "bye",
    "okay", "ok", "uh", "um", "hmm", "mm", "so", "the", "and", "yeah", "oh",
}


def build_regex(words):
    """'bro' also matches 'B.R.O.' and 'b r o'. 'hey/hi/ok' in front is swallowed too."""
    parts = []
    for w in words:
        chars = [re.escape(c) for c in w.lower() if c.isalnum()]
        if chars:
            parts.append(r"[\s.\-]*".join(chars))
    if not parts:
        return None
    return re.compile(
        r"(?<![a-z0-9])(?:(?:hey|hi|hello|okay|ok)[\s,.!]+)?(?:" + "|".join(parts) + r")(?![a-z0-9])",
        re.IGNORECASE,
    )


def extract(text, regex):
    """Return (woke, command). The command keeps the user's original spelling and casing."""
    if regex is None or not text:
        return False, (text or "").strip()
    m = regex.search(text)
    if not m:
        return False, text.strip()
    after = text[m.end():].lstrip(" ,.!?:;-").strip()  # keep a final "?" on the question
    before = text[:m.start()].strip(" ,.!?:;-")
    return True, after or before


def is_noise(text):
    cleaned = re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()
    return not cleaned or cleaned in HALLUCINATIONS
