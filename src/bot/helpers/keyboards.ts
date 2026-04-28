import { InlineKeyboard } from "grammy";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Ручной режим", "manual:menu").row()
    .text("⚙️ Настройки", "settings:menu").row()
    .text("🔗 Подключить TickTick", "connect:start").row()
    .text("❓ Помощь", "help:show");
}

export function settingsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔌 Отключить TickTick", "connect:disconnect").row()
    .text("◀️ Назад", "menu:main");
}

export function manualMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Создать задачу", "manual:create").row()
    .text("📋 Мои задачи", "manual:list").row()
    .text("✏️ Редактировать задачу", "manual:edit").row()
    .text("🗑 Удалить задачу", "manual:delete").row()
    .text("✅ Завершить задачу", "manual:complete").row()
    .text("📁 Создать список", "manual:create-project").row()
    .text("◀️ Назад", "menu:main");
}

export function projectsKeyboard(action: string, projects: { id: string; name: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const project of projects) {
    kb.text(project.name, `project:${action}:${project.id}`).row();
  }
  kb.text("◀️ Назад", "manual:menu");
  return kb;
}

export function tasksKeyboard(
  tasks: { id?: string; title: string; projectId?: string }[],
  action: string,
  projectId: string
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const task of tasks) {
    if (task.id) {
      kb.text(task.title, `task:${action}:${task.id}:${task.projectId ?? ""}`).row();
    }
  }
  kb.text("◀️ Назад", `project:${action}:${projectId}`);
  return kb;
}
