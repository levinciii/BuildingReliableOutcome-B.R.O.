"""Built-in commands you can say or type. Anything else goes to the AI model.

Spoken examples:  "switch model to claude"   "use the local model"   "which model are you using"
                  "list models"   "reset conversation"   "goodbye"
Typed examples:   /model claude   /models   /reset   /quit   /help
"""
import difflib
import re

EXIT_WORDS = {"quit", "exit", "goodbye", "good bye", "bye", "stop listening", "stop assistant",
              "shut down", "bye bro", "good night"}

_SWITCH = [
    re.compile(r"^(?:switch|change|set|use|go)\s+(?:the\s+)?(?:model|brain)\s+(?:over\s+)?(?:to\s+)?(?P<n>.+)$"),
    re.compile(r"^(?:switch|change|go)\s+(?:over\s+)?to\s+(?:the\s+)?(?P<n>.+?)\s+(?:model|brain)$"),
    re.compile(r"^use\s+(?:the\s+)?(?P<n>.+?)\s+(?:model|brain)$"),
]
_WHICH = re.compile(
    r"^(?:what|which)\s+(?:model|brain)(?:\s+(?:are\s+you\s+using|are\s+you\s+running|is\s+this|are\s+we\s+using|are\s+you))?$")
_LIST = re.compile(r"^(?:list|show|what\s+are)\s+(?:the\s+|my\s+|all\s+|all\s+the\s+)?(?:models|brains)$|^which\s+models\s+do\s+i\s+have$")
_RESET = re.compile(r"^(?:reset|clear|forget)\s+(?:the\s+|this\s+)?(?:conversation|chat|memory|context)$|^(?:start\s+over|new\s+conversation)$")
_HELP = re.compile(r"^(?:help|what\s+can\s+you\s+do|what\s+commands.*)$")


def normalize(text):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/ ]", " ", (text or "").lower())).strip()


def parse(text):
    """Return (command, argument) or None if this is a normal request for the AI."""
    t = normalize(text)
    if not t:
        return None
    if t.startswith("/"):
        word, _, arg = t.partition(" ")
        word = word.lstrip("/")
        if word in {"model", "brain", "switch"}:
            return ("switch", arg) if arg else ("which", None)
        if word in {"models", "brains"}:
            return ("list", None)
        if word in {"reset", "clear", "new"}:
            return ("reset", None)
        if word in {"quit", "exit", "bye"}:
            return ("exit", None)
        return ("help", None)
    if t in EXIT_WORDS:
        return ("exit", None)
    for pattern in _SWITCH:
        m = pattern.match(t)
        if m:
            return ("switch", m.group("n").strip())
    if _WHICH.match(t):
        return ("which", None)
    if _LIST.match(t):
        return ("list", None)
    if _RESET.match(t):
        return ("reset", None)
    if _HELP.match(t):
        return ("help", None)
    return None


_NUMBERS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
            "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10"}


def _key(name):
    """'Local Two', 'local-2' and 'local2' all become 'local2' (speech writes numbers as words)."""
    words = [_NUMBERS.get(w, w) for w in re.split(r"[^a-z0-9]+", name.lower()) if w]
    return "".join(words)


def match_profile(spoken, models):
    """Find the profile a person meant, even if speech recognition spelled it a bit differently."""
    want = _key(spoken)
    if not want:
        return None
    keys = {_key(n): n for n in models}
    if want in keys:
        return keys[want]
    for k, n in keys.items():  # "ollama" / "claude" / "openai" -> first profile of that type
        if want == _key(models[n].get("type", "")):
            return n
    close = difflib.get_close_matches(want, list(keys), n=1, cutoff=0.6)
    if close:
        return keys[close[0]]
    starts = [n for k, n in keys.items() if k.startswith(want) or want.startswith(k)]
    return starts[0] if len(starts) == 1 else None


HELP_TEXT = (
    "Say 'Hey bro' and then ask about your project. You can also say: "
    "'switch model to claude', 'which model are you using', 'list models', "
    "'reset conversation', or 'goodbye'."
)
