import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import input from "input";
import fs from "fs";
// === Настройки ===
const apiId = 23786159;
const apiHash = "6ed0b3de382c59f83fe872a9a32dfa2c";
const sessionFile = "./session.txt";

// const notesFile = "./notes.txt";
const keywords = [
    'нужнышш', 'шш', 'шишки', 'шишку', 'шишка', 'шмаль', 'стафчик', 'стафф', 'skero', 'weed',
    'бошки', 'плюшки', 'бух', 'драпчик', 'напас', 'банка', 'хапануть',
    'хапнуть', 'курнуть', 'укуриться',

];

// Загружаем сессию, если есть
let stringSession = process.env.STRING_SESSION || "";

const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5 });


const targetGroupName = "xxx"; // группа для логов
const LOG_GROUP_TITLE = "ccc"; // лог-группа для рассылки

// ===== Функция сна =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Запуск клиента =====
async function startClient() {
  if (!stringSession || stringSession.trim() === "") {
    await client.start({
      phoneNumber: async () => await input.text("Введите номер телефона: "),
      password: async () => await input.text("Введите пароль (2FA): "),
      phoneCode: async () => await input.text("Введите код из Telegram: "),
      onError: (err) => console.log(err),
    });

    stringSession = client.session.save();
    console.log("✅ UserBot запущен!");
    console.log("🔑 Скопируй и вставь это в .env как STRING_SESSION=");
    console.log(stringSession);
  } else {
    await client.connect();
    console.log("✅ UserBot запущен с существующей сессией!");
  }
}

// ===== Функция логирования в группу =====
async function addToGroup(text) {
  try {
    const dialogs = await client.getDialogs();
    const group = dialogs.find(d => d.title === targetGroupName);
    if (!group) {
      console.error("❌ Группа не найдена!");
      return;
    }
    await client.sendMessage(group.id, { message: text });
    console.log(`✅ Сообщение переслано в группу: ${targetGroupName}`);
  } catch (err) {
    console.error("Ошибка при отправке в группу:", err);
  }
}

// ===== Логика рассылки =====
async function startBroadcast() {
  const dialogs = await client.getDialogs({});
  let groups = dialogs
    .filter(d => d.isChannel || d.isGroup)
    .map(d => ({ entity: d.entity, title: d.entity.title }));

  if (groups.length === 0) {
    console.log("❌ Нет групп для рассылки");
    return;
  }

  const logGroup = groups.find(
    g => g.title && g.title.trim().toLowerCase() === LOG_GROUP_TITLE.toLowerCase()
  );

  async function logMessage(text) {
    console.log(text);
    if (logGroup) {
      try {
        await client.sendMessage(logGroup.entity, { message: text });
      } catch (e) {
        console.error("❌ Ошибка при логировании:", e.message);
      }
    }
  }

  let index = 0;

  while (true) {
    try {
      const result = await client.getMessages("me", { limit: 1 });
      const lastMessage = result[0];

      if (!lastMessage) {
        await logMessage("❌ Нет сообщений в Избранном!");
        await sleep(30000);
        continue;
      }

      const group = groups[index];

      if (group.title && group.title.trim().toLowerCase() === LOG_GROUP_TITLE.toLowerCase()) {
        await logMessage(`ℹ️ Пропущено пересылку в лог-группу: ${group.title}`);
      } else {
        try {
          await client.forwardMessages(group.entity, { messages: [lastMessage.id], fromPeer: "me" });
          await logMessage(`✅ Сообщение переслано в группу: ${group.title}`);
        } catch (err) {
          await logMessage(`❌ Ошибка при отправке в ${group.title}: ${err.message}`);
        }
      }

      index = (index + 1) % groups.length;
      await sleep(60 * 1000);

    } catch (err) {
      await logMessage(`⚠️ Ошибка цикла: ${err.message}`);
      await sleep(30000);
    }
  }
}

// ===== Логика поиска ключевых слов =====
client.addEventHandler(async (event) => {
  try {
    const message = event.message.message?.toLowerCase();
    if (!message || message.length > 20) return; // фильтр мусора
    if (!keywords.some(word => message.includes(word))) return;

    let messageLink = "[UNKNOWN CHAT]";
    try {
      const chat = await event.message.getChat();
      if (chat && chat.username) {
        messageLink = `https://t.me/${chat.username}/${event.message.id}`;
      } else if (chat && chat.title) {
        messageLink = `${chat.title} [PRIVATE GROUP, msgId:${event.message.id}]`;
      } else {
        messageLink = `[ID:${chat.id}, msgId:${event.message.id}]`;
      }
    } catch { }

    let senderName = "[UNKNOWN USER]";
    let sender = null;

    try { sender = await event.message.getSender(); } catch { }

    if (sender) {
      let username = null;
      try {
        const full = await client.getEntity(sender.id);
        if (full && full.username) username = full.username;
      } catch { }

      if (!username && event.message.isGroup) {
        try {
          const participants = await client.getParticipants(event.message.chatId);
          const foundUser = participants.find(u => u.id === sender.id);
          if (foundUser && foundUser.username) username = foundUser.username;
        } catch { }
      }

      if (username) {
        senderName = '@' + username;
      } else if (event.message.isGroup) {
        try {
          const participants = await client.getParticipants(event.message.chatId);
          const foundUser = participants.find(u => u.id === sender.id);
          if (foundUser) {
            const firstName = foundUser.first_name?.trim() || "";
            const lastName = foundUser.last_name?.trim() || "";
            senderName = (firstName + " " + lastName).trim() || `User${sender.id}`;
          }
        } catch (e) {
          console.error("Ошибка при получении участников:", e);
          senderName = `User${sender.id}`;
        }
      }
    } else if (event.message.senderId) {
      senderName = `[ID:${event.message.senderId}]`;
    }

    const noteText = `[⚡] Ключевое слово найдено в сообщении от ${senderName}:\n"${event.message.message}"\n🔗 ${messageLink}`;
    console.log(noteText);
    addToGroup(noteText);

  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
  }
}, new NewMessage({ incoming: true }));

// ===== Запуск =====
(async () => {
  await startClient();
  startBroadcast();
})();