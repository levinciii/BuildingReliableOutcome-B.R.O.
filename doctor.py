"""Setup checker: `python main.py --doctor`. Tells you what works, what doesn't, and fixes what it can."""
import os
import shutil
import subprocess
import sys

import brain
import config


def _line(ok, text):
    print(f"  [{'OK' if ok else '!!'}] {text}")
    return ok


def check_libraries():
    ok = True
    for module, pip_name in [("requests", "requests"), ("numpy", "numpy"), ("faster_whisper", "faster-whisper"),
                             ("sounddevice", "sounddevice"), ("pyttsx3", "pyttsx3"), ("anthropic", "anthropic")]:
        try:
            __import__(module)
            _line(True, f"library {pip_name}")
        except Exception as e:  # ImportError, or PortAudio missing for sounddevice
            ok = _line(False, f"library {pip_name} is not working ({e}). Run setup.bat again.") and ok
    return ok


def check_microphone():
    try:
        import stt
        devices = stt.list_microphones()
    except Exception as e:
        return _line(False, f"can't read microphones ({e})")
    if not devices:
        return _line(False, "no microphone found. Plug one in, or run with --text to type instead.")
    _line(True, f"{len(devices)} microphone(s) found. To pick one, put its number in bro.json -> audio -> input_device")
    for d in devices[:6]:
        print(d)
    return True


def check_model(settings, profile, fix=True):
    kind = profile["type"]
    label = f"model '{profile['name']}' ({kind}: {profile.get('model')})"
    if kind == "ollama":
        url = profile.get("url", "http://localhost:11434")
        if not shutil.which("ollama") and not brain.ollama_up(url):
            return _line(False, "Ollama is not installed. Get it from https://ollama.com, then run this again.")
        if not brain.ensure_ollama(url):
            return _line(False, "Ollama is installed but won't start. Open the Ollama app once.")
        _line(True, "Ollama is running")
        if brain.ollama_has(url, profile["model"]):
            return _line(True, f"{label} is downloaded")
        if not fix:
            return _line(False, f"{label} is not downloaded. Run: ollama pull {profile['model']}")
        print(f"  ... downloading {profile['model']} (this can take several minutes, one time only)")
        code = subprocess.call(["ollama", "pull", profile["model"]])
        return _line(code == 0 and brain.ollama_has(url, profile["model"]), f"{label} download")
    env = profile.get("api_key_env", "")
    if env and not os.environ.get(env):
        return _line(False, f"{label} needs {env} in the .env file")
    if "YOUR-" in str(profile.get("base_url", "")) + str(profile.get("model", "")):
        return _line(False, f"{label} is a template: fill in base_url and model in bro.json")
    return _line(True, f"{label} is configured")


def run(settings, profile, fix=True):
    print("\nB.R.O. check")
    print(f"  Python {sys.version.split()[0]} on {sys.platform}")
    if sys.version_info < (3, 10):
        _line(False, "Python 3.10 or newer is required")
    results = [check_libraries()]
    results.append(check_microphone())
    results.append(check_model(settings, profile, fix))
    print("\nAll good. Start B.R.O. with run.bat" if all(results) else "\nSome checks failed, see the [!!] lines above.")
    return all(results)
