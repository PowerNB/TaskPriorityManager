from flask import Flask, request, jsonify
from faster_whisper import WhisperModel
import os
import tempfile

app = Flask(__name__)

MODEL_NAME = "small"
HF_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub",
    "models--Systran--faster-whisper-small", "snapshots")

def find_model_path():
    local = os.path.join(os.path.dirname(__file__), "model")
    if os.path.isdir(local) and os.path.isfile(os.path.join(local, "model.bin")):
        return local
    if os.path.isdir(HF_CACHE):
        snapshots = sorted(os.listdir(HF_CACHE))
        if snapshots:
            return os.path.join(HF_CACHE, snapshots[-1])
    return MODEL_NAME  # will trigger auto-download

MODEL_PATH = find_model_path()
print(f"Loading Whisper model from: {MODEL_PATH}")
if MODEL_PATH == MODEL_NAME:
    print("Model not found locally — downloading (this may take a few minutes)...")
model = WhisperModel(MODEL_PATH, device="cpu", compute_type="int8")
print("Model loaded.")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        segments, _ = model.transcribe(tmp_path, language="ru", beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments)
        return jsonify({"text": text.strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050)
