from faster_whisper import WhisperModel
import os

MODEL_NAME = "small"

print(f"Downloading Whisper model '{MODEL_NAME}'...")
WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
print("Done.")
