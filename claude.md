TypeScript        — язык
Grammy            — Telegram bot framework
Grammy Sessions   — FSM диалогов
Prisma            — ORM
PostgreSQL        — основная БД
Redis             — сессии (Grammy) + очередь (BullMQ)
BullMQ            — планировщик задач

Код должен быть написан в микросервисная архитектуре - для того чтобы любые фичи можно было удалять или изменять и это не влияло на другие части кода 