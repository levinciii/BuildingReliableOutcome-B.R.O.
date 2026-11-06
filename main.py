"""Building Reliable Outcome (B.R.O.) - a hands-free voice coding assistant.

Easiest way to start: double-click run.bat (Windows). Or:  python main.py
"""
import argparse
import sys
import threading
import time
from pathlib import Path

import commands
import config
import wake
from brain import BrainError, make_brain
from tools import ProjectTools

try:
    import winsound  # Windows only; used for the little "I heard you" beeps
except ImportError:
    winsound = None

YES = {"yes", "yeah", "yep", "yup", "sure", "ok", "okay", "approve", "approved", "confirm", "go ahead",
       "do it", "yes please", "yes do it", "yes go ahead", "go for it"}
NO = {"no", "nope", "nah", "cancel", "stop", "deny", "dont", "do not", "no thanks", "no dont"}


class App:
    def __init__(self, settings, project_root, profile_name, mode, listener=None, speaker=None):
        self.settings = settings
        self.mode = mode  # wake | always | push | text
        self.listener = listener
        self.speaker = speaker
        self.profile_name = profile_name
        self.tools = ProjectTools(project_root, self.confirm)
        self.brain = None
        self.wake_re = wake.build_regex(settings.get("wake_words", ["bro"]))
        self.window = float(settings.get("conversation_seconds", 45))
        self.awake_until = 0.0
        self.sounds = bool(settings.get("sounds", True))

    # ------------------------------------------------------------ output
    def chime(self, kind):
        if not (self.sounds and winsound):
            return
        try:
            winsound.Beep({"wake": 880, "ask": 520}.get(kind, 660), 110)
        except Exception:
            pass

    def speak(self, text):
        if not self.speaker:
            return
        try:
            self.speaker.speak(text)
        except Exception as e:
            print(f"  (voice problem: {e}. Continuing with text only.)")
            self.speaker = None
        if self.listener:
            time.sleep(0.3)           # let the room echo die down
            self.listener.flush()     # and never hear my own voice

    def say(self, text, spoken=None):
        print(f"\nB.R.O.: {text}\n")
        self.speak(text if spoken is None else spoken)

    # ------------------------------------------------------------ brain / models
    def load_brain(self, name):
        brain = make_brain(self.tools, config.get_profile(self.settings, name))
        brain.prepare()
        return brain

    def start_brain(self):
        self.brain = self.load_brain(self.profile_name)
        threading.Thread(target=self.brain.warm_up, daemon=True).start()

    def switch_model(self, spoken_name):
        name = commands.match_profile(spoken_name, self.settings["models"])
        if not name:
            return f"I don't have a model called {spoken_name}. Say 'list models' to hear what I have."
        try:
            brain = self.load_brain(name)
        except BrainError as e:
            return f"I can't switch to {name}. {e}"
        self.brain, self.profile_name = brain, name
        self.settings["active_model"] = name
        config.save_settings(self.settings)
        threading.Thread(target=brain.warm_up, daemon=True).start()
        return f"Switched to {brain.describe()}. Starting a fresh conversation."

    def models_table(self):
        return models_table(self.settings["models"], self.profile_name)

    # ------------------------------------------------------------ approvals
    def confirm(self, prompt):
        hands_free = self.mode in ("wake", "always") and self.listener
        if hands_free and self.settings.get("approvals") == "voice":
            return self._voice_confirm(prompt)
        if hands_free:
            self.chime("ask")
            self.speak("I need your approval. Please check the terminal.")
        answer = input(f"\n  ? {prompt}  Allow? [y/N] ").strip().lower()
        return answer in {"y", "yes"}

    def _voice_confirm(self, prompt):
        print(f"\n  ? {prompt}")
        self.chime("ask")
        self.speak(f"{prompt}. Should I go ahead? Say yes or no.")
        for _ in range(2):
            text = self.listener.listen(wait_seconds=10)
            if not text:
                continue
            _, said = wake.extract(text, self.wake_re)
            print(f"  heard: {text}")
            answer = commands.normalize(said or text)
            if answer in YES:
                return True
            if answer in NO:
                return False
        print("  (no clear answer, so I did not do it)")
        return False

    # ------------------------------------------------------------ handling what you said
    def handle(self, text):
        """Run one request. Returns False when it is time to quit."""
        parsed = commands.parse(text)
        if parsed:
            return self.run_builtin(*parsed)
        print("  thinking...")
        try:
            self.say(self.brain.ask(text) or "(no answer)")
        except BrainError as e:
            self.brain.rollback()
            self.say(str(e), spoken="I hit a problem. Check the terminal.")
        except Exception as e:
            self.brain.rollback()
            self.say(f"Something went wrong: {e}", spoken="Something went wrong. Check the terminal.")
        return True

    def run_builtin(self, cmd, arg):
        if cmd == "exit":
            self.say("Goodbye!")
            return False
        if cmd == "switch":
            self.say(self.switch_model(arg))
        elif cmd == "which":
            self.say(f"I'm using {self.brain.describe()}.")
        elif cmd == "list":
            print("\n" + self.models_table())
            names = ", ".join(self.settings["models"])
            self.say(f"Models: {names}. Active: {self.profile_name}.", spoken=f"My models are {names}. I'm using {self.profile_name}.")
        elif cmd == "reset":
            self.brain.reset()
            self.say("Okay, starting a fresh conversation.")
        else:
            self.say(commands.HELP_TEXT)
        return True

    # ------------------------------------------------------------ main loops
    def loop_typed(self):
        push = self.mode == "push" and self.listener
        while True:
            try:
                typed = input("You (Enter = talk): " if push else "You: ").strip()
            except EOFError:
                return
            if typed:
                text = typed
            elif push:
                print("  Listening...")
                text = self.listener.listen(wait_seconds=8)
                if not text:
                    print("  (didn't catch anything)")
                    continue
                print(f"  You said: {text}")
            else:
                continue
            if not self.handle(text):
                return

    def loop_handsfree(self):
        ambient, threshold = self.listener.calibrate()
        print(f"  Room noise {ambient:.4f}, speech threshold {threshold:.4f} (set automatically)")
        hint = "say 'Hey bro' first" if self.mode == "wake" else "just talk"
        print(f"\n  Listening, {hint}. Press Ctrl+C to quit.\n")
        while True:
            text = self.listener.listen(wait_seconds=None)
            if not text:
                continue
            woke, command = wake.extract(text, self.wake_re)
            in_window = time.time() < self.awake_until
            if self.mode == "wake" and not woke and not in_window:
                print(f"  heard: {text}   (say 'Hey bro' first)")
                continue
            if not woke and wake.is_noise(text):
                continue
            if woke:
                self.chime("wake")
                if not command:
                    self.say("Yes?")
                    self.awake_until = time.time() + self.window
                    continue
            print(f"  You: {command}")
            if not self.handle(command):
                return
            self.awake_until = time.time() + self.window
            print(f"  Listening ({'no need to say Hey bro for ' + str(int(self.window)) + ' seconds' if self.mode == 'wake' else 'just talk'})...")

    def run(self):
        if self.mode in ("wake", "always"):
            self.loop_handsfree()
        else:
            self.loop_typed()


# ---------------------------------------------------------------- startup helpers
def models_table(models, active):
    lines = []
    for name, p in models.items():
        mark = "*" if name == active else " "
        lines.append(f" {mark} {name:<12} {p.get('type', '?'):<7} {p.get('model', ''):<22} {p.get('description', '')}")
    return "\n".join(lines)


def resolve_project(path_arg, settings):
    path = path_arg or settings.get("project") or ""
    if path and Path(path).expanduser().is_dir():
        root = Path(path).expanduser().resolve()
    else:
        if path:
            print(f"The saved project folder no longer exists: {path}")
        if not sys.stdin.isatty():
            sys.exit("Tell me the project folder with:  python main.py --project <folder>")
        while True:
            typed = input("Paste the folder path of the project you want help with: ").strip().strip('"').strip("'")
            if typed and Path(typed).expanduser().is_dir():
                root = Path(typed).expanduser().resolve()
                break
            print("  That folder doesn't exist. Tip: in File Explorer, Shift+right-click the folder, 'Copy as path'.")
    if settings.get("project") != str(root):
        settings["project"] = str(root)
        config.save_settings(settings)
    return root


def build_parser():
    p = argparse.ArgumentParser(description="B.R.O. - Building Reliable Outcome: hands-free voice coding assistant")
    p.add_argument("-p", "--project", help="project folder (remembered for next time)")
    p.add_argument("-m", "--model", help="model profile from bro.json, e.g. local, claude, openai (remembered)")
    p.add_argument("--mode", choices=["wake", "always", "push", "text"],
                   help="wake = say 'Hey bro' (default), always = always listening, push = press Enter, text = type")
    p.add_argument("--text", action="store_true", help="same as --mode text")
    p.add_argument("--mute", action="store_true", help="don't speak replies aloud")
    p.add_argument("--models", action="store_true", help="list the available models and exit")
    p.add_argument("--doctor", action="store_true", help="check the setup, download the model, and exit")
    return p


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # never crash on a character the console can't show
        except Exception:
            pass
    args = build_parser().parse_args()
    config.load_env()
    settings = config.load_settings()

    if args.models:
        print("Models (* = active). Change with --model <name> or say 'switch model to <name>'.\n")
        print(models_table(settings["models"], settings["active_model"]))
        return

    if args.model:
        name = commands.match_profile(args.model, settings["models"])
        if not name:
            sys.exit(f"No model called '{args.model}'. Available: {', '.join(settings['models'])}")
        settings["active_model"] = name
        config.save_settings(settings)

    try:
        profile = config.get_profile(settings, settings["active_model"])
    except KeyError as e:
        sys.exit(str(e).strip("'\""))

    if args.doctor:
        import doctor
        sys.exit(0 if doctor.run(settings, profile) else 1)

    mode = "text" if args.text else (args.mode or settings.get("listen_mode", "wake"))
    root = resolve_project(args.project, settings)

    listener = speaker = None
    if mode != "text":
        try:
            from stt import Listener
            listener = Listener(settings["speech_model"], settings["audio"])
            listener._ensure_stream()  # open the mic now so a problem shows up right away
        except Exception as e:
            print(f"Microphone or speech model unavailable ({e}).")
            print("Falling back to typing. Run  run.bat --doctor  to find out why.\n")
            mode, listener = "text", None
    if not args.mute:
        try:
            from tts import Speaker
            audio = settings["audio"]
            speaker = Speaker(audio.get("speech_rate", 185), audio.get("max_spoken_chars", 700))
        except Exception as e:
            print(f"Text-to-speech unavailable ({e}). Replies will be text only.\n")

    app = App(settings, root, settings["active_model"], mode, listener, speaker)
    try:
        app.start_brain()
    except BrainError as e:
        sys.exit(f"\n{e}\n\nTip: run  run.bat --doctor  to check everything, or  run.bat --model <name>  to use another model.")

    print("\n=== Building Reliable Outcome (B.R.O.) ===")
    print(f"Project: {root}")
    print(f"Brain:   {app.brain.describe()}   (change: say 'switch model to ...' or run with --model)")
    print(f"Mode:    {mode}")
    if profile["type"] == "ollama":
        print("Note:    the first answer can take a minute while the model loads into memory.")
    if mode == "text" or mode == "push":
        print("Type a message (Enter alone = talk in push mode). Type /help for commands, /quit to leave.\n")

    try:
        app.run()
    except KeyboardInterrupt:
        pass
    finally:
        if listener:
            listener.close()
    print("\nBye!")


if __name__ == "__main__":
    main()
