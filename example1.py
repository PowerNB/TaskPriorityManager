import subprocess
import time
import json

def call_claude(prompt, max_retries=3):
    """Вызов Claude Code CLI с retry и экспоненциальным backoff."""
    if not CLAUDE_PATH:
        raise RuntimeError("CLAUDE_PATH не определён")
    
    delays = [10, 30, 60]
    last_error = None
    
    for attempt in range(max_retries):
        try:
            result = subprocess.run(
                [str(CLAUDE_PATH), "-p", "--dangerously-skip-permissions"],
                input=prompt,
                capture_output=True,
                text=True,
                timeout=180,
                encoding="utf-8"
            )
            if result.returncode != 0:
                raise RuntimeError(f"returncode={result.returncode}: {result.stderr[:300]}")
            if not result.stdout.strip():
                raise RuntimeError(f"Пустой ответ. stderr: {result.stderr[:200]}")
            return result.stdout.strip()
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            last_error = e
            if attempt < max_retries - 1:
                wait = delays[attempt]
                print(f"    ⏳ Попытка {attempt+1}/{max_retries}: {e}")
                print(f"       Повтор через {wait} сек...")
                time.sleep(wait)
            else:
                print(f"    💀 Все {max_retries} попытки исчерпаны")
    raise last_error


def parse_response(response):
    """Парсинг JSON из ответа Claude с валидацией типов."""
    cleaned = response
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0]
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0]
    data = json.loads(cleaned.strip())
    _validate_monthly(data)
    return data


def _validate_monthly(data):
    """Проверяет и исправляет типы в месячном ответе Claude."""
    sent = data.get("sentiment", {})
    for key in ["positive_score", "negative_score", "neutral_score"]:
        sent[key] = _to_float(sent.get(key), 0.0, 1.0)
    emo = data.get("emotions", {})
    for key in ["joy", "anxiety", "sadness", "anger", "disgust", "surprise"]:
        emo[key] = _to_float(emo.get(key), 0.0, 1.0)
    b5 = data.get("big_five", {})
    for key in ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]:
        b5[key] = _to_float(b5.get(key), 0.0, 1.0)
    topics = data.get("topics", {})
    if not isinstance(topics.get("top_3", []), list):
        topics["top_3"] = []


def _to_float(val, min_val=None, max_val=None):
    """Безопасное приведение к float с опциональным clamp."""
    if val is None:
        return None
    try:
        f = float(val)
        if min_val is not None: f = max(f, min_val)
        if max_val is not None: f = min(f, max_val)
        return round(f, 3)
    except (ValueError, TypeError):
        return None

print("✅ Вспомогательные функции Claude загружены")