# TaskPriorityManager Bot

Telegram-бот для управления задачами через TickTick. Анализирует текст задачи с помощью локальной LLM (Ollama), определяет тип задачи, раскладывает её по нужным спискам и назначает временные теги. Поддерживает голосовые сообщения и кружки через faster-whisper.

---

## Возможности

- **Умный разбор задач** — пишешь задачу обычным текстом, бот сам разбирается что это: простая задача, проект, задача с привязкой ко времени
- **Голосовые сообщения и кружки** — бот распознаёт речь через faster-whisper и обрабатывает как текст
- **Автоматическое распределение** по спискам TickTick: Входящие, Календарь, Простые задачи, Проектные задачи
- **Временные теги** — 5-минут, 30-минут, 1-час, 2-часа+
- **Проектные задачи** разбиваются на чеклист подшагов прямо внутри задачи
- **Удаление, завершение и редактирование** задач в сообщении: "удали задачу купить хлеб"
- **Ручной режим** — полное управление задачами и списками через кнопки
- **Whitelist** — доступ к боту только для участников указанной Telegram-группы

---

## Требования

- Node.js 20+
- Python 3.9+
- [Ollama](https://ollama.com) с моделью `qwen2.5:7b`
- Аккаунт TickTick с доступом к [Developer Portal](https://developer.ticktick.com)
- Telegram Bot Token от [@BotFather](https://t.me/BotFather)

---

## Установка

### 1. Клонировать репозиторий

```bash
git clone https://github.com/your-username/TaskPriorityManager.git
cd TaskPriorityManager
npm install
```

### 2. Установить Ollama и скачать модель

```bash
# Установить Ollama: https://ollama.com
ollama pull qwen2.5:7b
```

### 3. Установить Python-зависимости для голосовых сообщений

```bash
pip install faster-whisper flask
```

Модель Whisper (~460MB) скачается автоматически при первом запуске сервера.

### 4. Настроить переменные окружения

```bash
cp .env.example .env
```

Заполнить `.env`:

```env
BOT_TOKEN=your_telegram_bot_token
TICKTICK_REDIRECT_URI=https://oauth.pstmn.io/v1/callback
DATABASE_URL="file:./dev.db"
LOG_LEVEL=info
NODE_ENV=development

# Опционально — ID Telegram-группы для whitelist (только участники группы могут пользоваться ботом)
# WHITELIST_GROUP_ID=-1001234567890
```

### 5. Инициализировать базу данных

```bash
npm run db:generate
npm run db:push
```

### 6. Собрать и запустить

Запускать нужно два процесса одновременно.

**Терминал 1 — Whisper сервер:**
```bash
python whisper-server/server.py
```

Подождать пока появится `Model loaded.`

**Терминал 2 — бот:**
```bash
npm run build
npm start
```

Для разработки с горячей перезагрузкой:

```bash
npm run dev
```

---

## Подключение TickTick

### 1. Создать приложение в TickTick Developer Portal

1. Открыть [developer.ticktick.com/manage](https://developer.ticktick.com/manage)
2. Нажать **New App**
3. Заполнить форму:
   - **Name** — любое название, например `Task Priority Manager`
   - **App Service URL** — `https://oauth.pstmn.io/v1/callback`
4. Нажать **Add**
5. Открыть созданное приложение и скопировать **Client ID** и **Client Secret**

### 2. Подключить в боте

1. В боте нажать **🔗 Подключить TickTick** или отправить `/connect`
2. Ввести `Client ID`
3. Ввести `Client Secret`
4. Перейти по сгенерированной ссылке авторизации, разрешить доступ
5. Скопировать параметр `code` из адресной строки браузера (после редиректа) и отправить боту

После успешного подключения бот автоматически создаст 4 списка в TickTick если их нет:
- **Входящие**
- **Календарь**
- **Простые задачи**
- **Проектные задачи**

---

## Whitelist (ограничение доступа)

Если нужно ограничить доступ к боту только для определённых пользователей:

1. Создать Telegram-группу и добавить туда бота
2. Дать боту права **администратора** в группе
3. Узнать ID группы — добавить [@getidsbot](https://t.me/getidsbot) в группу
4. Добавить в `.env`:
   ```env
   WHITELIST_GROUP_ID=-1001234567890
   ```
5. Перезапустить бота

Все участники группы автоматически получают доступ. При выходе из группы — доступ закрывается. Первого пользователя нужно добавить вручную через Prisma Studio:

```bash
npx prisma studio
```

---

## Как пользоваться

### Добавить задачу

Текстом или голосовым сообщением / кружком:

```
Купить продукты в магазине
Встреча с клиентом в пятницу в 15:00
Сделать приложение для учёта расходов
```

Бот проанализирует задачу и добавит её в нужный список.

Можно добавлять подсказки прямо в текст:

```
Позвонить в банк, 5 минут
Написать отчёт, сложная задача
```

### Посмотреть задачи

```
Покажи мои задачи
Задачи в Календаре
Все задачи
```

### Управлять задачами через текст

```
Удали задачу "позвонить в банк"
Заверши задачу написать отчёт
Поменяй название задачи встреча с клиентом на встреча с партнёром
Измени задачу купить продукты        ← бот спросит что именно менять
```

Если нашлось несколько похожих задач — бот покажет список кнопками.

### Ручной режим

Нажать **✏️ Ручной режим** в главном меню. Доступные действия:

| Кнопка | Описание |
|--------|----------|
| ➕ Создать задачу | Создать задачу в выбранном списке |
| 📋 Мои задачи | Посмотреть задачи в любом списке |
| ✏️ Редактировать задачу | Изменить название, тег или список |
| 🗑 Удалить задачу | Удалить задачу из списка |
| ✅ Завершить задачу | Отметить задачу выполненной |
| 📁 Создать список | Создать новый список в TickTick |

---

## Как работает бот

### Архитектура

```
Telegram Update
      │
      ▼
  grammY Bot
      │
   Middleware (сессия, авторизация, whitelist)
      │
   Features (Composer)
      │
  ┌───┴────────────────────────┐
  │                            │
task.ts                   manual.ts
(текст / голос)           (ручной режим)
  │
  ▼
routeTask()
  │
  ├── detectIntent() — ключевые слова → create/delete/complete/edit/list
  │
  ├── create → analyzeTask() → Ollama (qwen2.5:7b) → JSON
  │                │
  │         createTask() в TickTick API
  │
  └── delete/complete/edit/list → searchTasks() / getProjectTasks()
```

### Голосовые сообщения

```
voice / video_note
      │
      ▼
Скачать OGG с серверов Telegram
      │
      ▼
POST /transcribe → faster-whisper (Python сервер)
      │
      ▼
Текст → routeTask() (та же логика что и для текста)
```

### Анализ задачи (Ollama)

Бот отправляет текст задачи в локальную модель `qwen2.5:7b` через Ollama HTTP API. Модель возвращает JSON:

```json
{
  "taskTitle": "Название задачи",
  "taskType": "simple | calendar | project",
  "complexity": "low | medium | high",
  "duration": "5min | 30min | 1hour | 2hours+",
  "estimatedMinutes": 5,
  "subtasks": [...]
}
```

### Распределение по спискам

| Тип задачи | Список |
|------------|--------|
| `calendar` — встречи, звонки, дедлайны | Календарь |
| `simple` — купить, сходить, написать | Простые задачи |
| `project` — разработка, исследование | Проектные задачи |

### Временные теги

| duration | Тег |
|----------|-----|
| 5min | 5-минут |
| 30min | 30-минут |
| 1hour | 1-час |
| 2hours+ | 2-часа+ |

### Технологии

| Компонент | Технология |
|-----------|------------|
| Bot framework | [grammY](https://grammy.dev) v1.31 |
| LLM | [Ollama](https://ollama.com) + qwen2.5:7b |
| Speech-to-text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) small |
| Database | SQLite + [Prisma](https://prisma.io) 6 |
| Task manager | [TickTick Open API](https://developer.ticktick.com) |
| Language | TypeScript + Python |
| Logging | pino |

---

## Структура проекта

```
src/
├── bot/
│   ├── conversations/     # Многошаговые диалоги (grammY conversations)
│   ├── features/          # Обработчики команд и кнопок
│   ├── helpers/           # Клавиатуры, форматирование
│   ├── middleware/        # Авторизация, whitelist
│   ├── repositories/      # Работа с БД
│   ├── services/          # Бизнес-логика (анализ, обработка задач)
│   ├── types/             # TypeScript типы
│   ├── context.ts         # Тип контекста grammY
│   └── index.ts           # Сборка бота
├── claude/
│   └── client.ts          # Клиент Ollama
├── ticktick/
│   ├── client.ts          # TickTick API клиент
│   └── projects.ts        # Константы списков и тегов
├── voice/
│   └── transcriber.ts     # Клиент faster-whisper сервера
├── config.ts              # Конфиг из .env
└── main.ts                # Точка входа
whisper-server/
├── server.py              # Flask сервер для транскрипции
└── download_model.py      # Скрипт ручного скачивания модели
prisma/
└── schema.prisma          # Схема БД
```
