import time
import random
import subprocess
from tqdm.notebook import tqdm

CLAUDE_PROGRESS_FILE = OUTPUT_DIR / "claude_progress.json"

def load_claude_progress():
    if CLAUDE_PROGRESS_FILE.exists():
        with open(CLAUDE_PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_claude_progress(data):
    with open(CLAUDE_PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_sample(month_df):
    """
    Стратифицированная выборка с детекцией аномалий.
    Страта 1 (фон):      дни с z-score ≤ 1.5  → 10 окон
    Страта 2 (аномалии): дни с z-score > 1.5  → 5 окон + контекст ±2 день
    """
    WINDOW_SIZE = 10
    MIN_MY_IN_WINDOW = 2
    N_NORMAL = 10
    N_ANOMALY = 5

    month_sorted = month_df.sort_values("datetime").reset_index(drop=True)
    month_sorted["date"] = month_sorted["datetime"].dt.date

    # ── Шаг 1: сигнал активности по дням ──
    daily = month_sorted.groupby("date").agg(
        msg_count=("text", "count"),
        avg_len=("text_len", "mean")
    ).reset_index()

    if len(daily) < 2:
        # Мало дней — просто берём все окна
        windows = _build_windows(month_sorted, WINDOW_SIZE, MIN_MY_IN_WINDOW, N_NORMAL + N_ANOMALY)
        total_my = month_sorted[month_sorted["is_mine"]].shape[0]
        msgs_in_windows = sum(w.count("Ты:") for w in windows)
        coverage = {
            "windows_count": len(windows),
            "total_my_msgs": total_my,
            "approx_msgs_sampled": msgs_in_windows,
            "coverage_pct": round(msgs_in_windows / max(total_my, 1) * 100, 1)
        }
        return windows, coverage

    # ── Шаг 2: Z-score для детекции аномальных дней ──
    mu = daily["msg_count"].mean()
    sigma = daily["msg_count"].std()

    if sigma == 0:
        daily["z"] = 0.0
    else:
        daily["z"] = (daily["msg_count"] - mu) / sigma

    anomaly_dates = set(daily[daily["z"] > 1.5]["date"].tolist())

    # Расширяем аномальные дни на ±1 день (контекст)
    expanded_anomaly = set()
    all_dates = sorted(daily["date"].tolist())
    for d in anomaly_dates:
        idx = all_dates.index(d)
        for offset in [-2, -1, 0, 1, 2]:
            neighbor_idx = idx + offset
            if 0 <= neighbor_idx < len(all_dates):
                expanded_anomaly.add(all_dates[neighbor_idx])

    normal_dates = set(daily[daily["z"] <= 1.5]["date"].tolist()) - expanded_anomaly

    # ── Шаг 3: строим окна по стратам ──
    anomaly_df = month_sorted[month_sorted["date"].isin(expanded_anomaly)]
    normal_df  = month_sorted[month_sorted["date"].isin(normal_dates)]

    anomaly_windows = _build_windows(anomaly_df, WINDOW_SIZE, MIN_MY_IN_WINDOW, N_ANOMALY)
    normal_windows  = _build_windows(normal_df,  WINDOW_SIZE, MIN_MY_IN_WINDOW, N_NORMAL)

    all_windows = anomaly_windows + normal_windows

    # Помечаем аномальные окна для Claude
    tagged = []
    for w in anomaly_windows:
        tagged.append("[⚡ АНОМАЛЬНАЯ АКТИВНОСТЬ]\n" + w)
    for w in normal_windows:
        tagged.append(w)

    windows = tagged if tagged else _build_windows(month_sorted, WINDOW_SIZE, MIN_MY_IN_WINDOW, N_NORMAL)
    
    # Статистика покрытия
    total_my = month_sorted[month_sorted["is_mine"]].shape[0]
    msgs_in_windows = sum(w.count("Ты:") for w in windows)
    coverage = {
        "windows_count": len(windows),
        "total_my_msgs": total_my,
        "approx_msgs_sampled": msgs_in_windows,
        "coverage_pct": round(msgs_in_windows / max(total_my, 1) * 100, 1)
    }
    return windows, coverage


def _build_windows(df, window_size, min_my, max_windows):
    """Строит диалоговые окна из датафрейма."""
    if len(df) == 0:
        return []

    all_windows = []
    conversations = df.groupby("conversation_id")

    for _, conv_df in conversations:
        conv_df = conv_df.reset_index(drop=True)
        if len(conv_df) < 3:
            continue

        for start in range(0, len(conv_df) - window_size + 1, window_size // 2):
            window = conv_df.iloc[start:start + window_size]

            if window["is_mine"].sum() < min_my:
                continue

            lines = [f"[Диалог: {conv_df['conversation_name'].iloc[0]}]"]
            for _, row in window.iterrows():
                time_str = row["datetime"].strftime("%d.%m %H:%M")
                name = "Ты" if row["is_mine"] else row["sender_name"]
                text = str(row["text"]).strip()
                if text:
                    lines.append(f"[{time_str}] {name}: {text}")

            if len(lines) > 2:
                all_windows.append("\n".join(lines))

    if len(all_windows) > max_windows:
        rng = random.Random(hash(str(df["datetime"].iloc[0])))  # детерминированный seed
        all_windows = rng.sample(all_windows, max_windows)

    return all_windows

def build_claude_prompt(month, dialog_windows, fast_m, coverage=None):
    """
    Промпт с диалоговым контекстом.
    ВАЖНО: Big Five калибруется относительно 0.5 как нейтральной точки.
    MBTI НЕ запрашивается на месячном уровне.
    """
    energy = fast_m.get("energy", {})
    liwc = fast_m.get("liwc_like", {})
    composite = fast_m.get("composite_indices", {})
    clinical = fast_m.get("clinical_proxies", {})
    if coverage is None:
        coverage = {}
    
    dialogs_text = "\n\n---\n\n".join(dialog_windows) if dialog_windows else "(нет данных)"

    return f"""Ты психолог-аналитик и лингвист. Проанализируй переписку человека за {month}.

КОНТЕКСТ (метаданные):
- Написал сообщений: {energy.get('my_msg_count', '?')}, активных дней: {energy.get('active_days', '?')}
- Покрытие выборки: {coverage.get('coverage_pct', '?')}% сообщений ({coverage.get('windows_count', '?')} диалоговых окон из {coverage.get('total_my_msgs', '?')} моих сообщений)
- Я-центричность (i_words): {liwc.get('i_words', '?')}%, тревога: {liwc.get('anxiety', '?')}%
- Радость: {liwc.get('joy', '?')}%, грусть: {liwc.get('sadness', '?')}%, злость: {liwc.get('anger', '?')}%
- Когнитивность: {liwc.get('cognitive', '?')}%, социальность: {liwc.get('social', '?')}%

КОМПЛЕКСНЫЕ ИНДЕКСЫ:
- Well-being index: {composite.get('wellbeing_index', '?')} (0=низкий, 1=высокий)
- Социальная изоляция: {composite.get('social_isolation_index', '?')} (1=изолирован, 0.5=баланс)
- Руминация: {composite.get('rumination_index', '?')}

КЛИНИЧЕСКИЕ ПРОКСИ (лингвистические маркеры, НЕ диагностика):
- PHQ-9 proxy: {clinical.get('phq9_proxy', {}).get('total_score', '?')}
- GAD-7 proxy: {clinical.get('gad7_proxy', {}).get('total_score', '?')}

ВАЖНО: ты видишь {coverage.get('coverage_pct', '?')}% переписки. При низком покрытии (<20%) делай выводы осторожнее.

ДИАЛОГИ (связные куски переписки, "Ты" — анализируемый человек):

{dialogs_text}

═══════════════════════════════════════════════════════════════════════════
ИНСТРУКЦИЯ ПО BIG FIVE:
Используй 0.5 как НЕЙТРАЛЬНУЮ ТОЧКУ для всех шкал.
- 0.5 = средний уровень (ни высокий, ни низкий)
- > 0.5 = выше среднего
- < 0.5 = ниже среднего
- Крайние значения (0.0-0.2 или 0.8-1.0) — только при очень явных признаках
Калибруй оценки относительно этой нейтральной точки для сопоставимости между месяцами.
═══════════════════════════════════════════════════════════════════════════

Верни ТОЛЬКО валидный JSON без пояснений и без markdown-блоков:
{{
  "sentiment": {{
    "overall": "позитивный | нейтральный | негативный | смешанный",
    "positive_score": 0.0,
    "negative_score": 0.0,
    "neutral_score": 0.0,
    "comment": "1 предложение об эмоциональном тоне"
  }},
  "emotions": {{
    "joy": 0.0,
    "anxiety": 0.0,
    "sadness": 0.0,
    "anger": 0.0,
    "disgust": 0.0,
    "surprise": 0.0,
    "dominant": "название доминирующей эмоции",
    "comment": "1 предложение"
  }},
  "topics": {{
    "top_3": ["тема1", "тема2", "тема3"],
    "description": "О чём думал и говорил в этот период"
  }},
  "big_five": {{
    "openness": 0.5,
    "conscientiousness": 0.5,
    "extraversion": 0.5,
    "agreeableness": 0.5,
    "neuroticism": 0.5,
    "comment": "Ключевые черты личности в этом месяце (помни: 0.5 = нейтраль)"
  }},
  "monthly_summary": "3-4 предложения: кем ты был в этот месяц, что занимало, как менялся",
  "personality_shift_signal": "Заметный сдвиг или стабильность личности"
}}

Оценки 0.0-1.0, где 0.5 = нейтраль. Анализируй поведение и стиль человека с пометкой Ты.

ВАЖНО ПО АНОМАЛИЯМ:
Окна помеченные [⚡ АНОМАЛЬНАЯ АКТИВНОСТЬ] — дни со статистически высокой активностью (z-score > 1.5).
Это могут быть важные события, конфликты, эмоциональные всплески.
Уделяй им особое внимание при анализе — они важнее фоновых окон.

"""

# Основной цикл
claude_results = load_claude_progress()
already_done = set(claude_results.keys())

valid_months = [
    m for m in sorted(df["month"].unique())
    if df[(df["month"] == m) & df["is_mine"]].shape[0] >= MIN_MY_MESSAGES
]
to_process = [m for m in valid_months if m not in already_done]

print(f"📅 Всего месяцев: {len(valid_months)}")
print(f"✅ Уже обработано: {len(already_done)}")
print(f"⏳ Осталось: {len(to_process)}")
est_min = len(to_process) * (DELAY_SECONDS + 20) // 60
print(f"🕐 Примерное время: ~{est_min} мин ({est_min//60}ч {est_min%60}м)")

errors = []

for month in tqdm(to_process, desc="Claude-анализ"):
    try:
        month_df = df[df["month"] == month]
        fast_m = fast_results.get(month, {})
        dialog_windows, coverage = get_sample(month_df)
        prompt = build_claude_prompt(month, dialog_windows, fast_m, coverage)
        response = call_claude(prompt)
        parsed = parse_response(response)
        claude_results[month] = parsed
        save_claude_progress(claude_results)
        summary_preview = parsed.get("monthly_summary", "")[:70]
        print(f"  ✅ {month}: {summary_preview}...")
    except json.JSONDecodeError as e:
        print(f"  ❌ {month}: JSON parse error — {e}")
        errors.append({"month": month, "error": f"JSON: {e}"})
    except Exception as e:
        print(f"  ❌ {month}: {e}")
        errors.append({"month": month, "error": str(e)})
    time.sleep(DELAY_SECONDS)

print(f"\n🎉 Готово! Claude обработал {len(claude_results)} месяцев")
if errors:
    print(f"⚠️  Ошибки: {[e['month'] for e in errors]}")