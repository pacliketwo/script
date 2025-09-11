require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
let stringSession = process.env.STRING_SESSION || "";

const targetGroupName = process.env.TARGET_GROUP_NAME; // "xxx"
const logGroupTitle = process.env.LOG_GROUP_TITLE;     // "ccc"
const keywords = process.env.KEYWORDS ? process.env.KEYWORDS.split(",") : [];

const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5 });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== Отправка сообщений в группу =====
async function sendToGroup(groupTitle, text) {
  try {
    const dialogs = await client.getDialogs();
    const group = dialogs.find(d => d.title === groupTitle);
    if (!group) return;
    await client.sendMessage(group.id, { message: text });
  } catch (err) {
    console.error(`Ошибка при отправке в "${groupTitle}":`, err);
  }
}

// ===== Рассылка сообщений из Избранного по очереди =====
async function broadcastFromMe() {
  let index = 0;

  while (true) {
    try {
      const dialogs = await client.getDialogs();
      const groups = dialogs.filter(d => (d.isGroup || d.isChannel) && d.title !== targetGroupName);
      if (!groups.length) {
        await sleep(20000);
        continue;
      }

      const lastMessage = (await client.getMessages("me", { limit: 1 }))[0];
      if (!lastMessage) {
        await sleep(20000);
        continue;
      }

      // Выбираем группу по индексу
      const group = groups[index % groups.length];

      try {
        await client.forwardMessages(group.entity, { messages: [lastMessage.id], fromPeer: "me" });
        await sendToGroup(logGroupTitle, `✅ Переслано сообщение в "${group.title}"`);
      } catch (e) {
        if (e.errorMessage === "FLOOD" && e.seconds) {
          console.log(`⚠ SlowMode: ждем ${e.seconds} секунд для "${group.title}"`);
          await sleep((e.seconds + 1) * 1000);
          continue;
        } else {
          await client.sendMessage(group.id, { message: lastMessage.message || "📎 [Медиа]" });
          await sendToGroup(logGroupTitle, `⚡ Отправлено как текст в "${group.title}"`);
        }
      }

      index++; // следующая группа в следующем цикле
      await sleep(20000); // 20 секунд между группами
    } catch (err) {
      console.error("Ошибка цикла рассылки:", err);
      await sleep(20000);
    }
  }
}

// ===== Мониторинг ключевых слов =====
client.addEventHandler(async (event) => {
  try {
    const messageText = event.message.message?.toLowerCase();
    if (!messageText || messageText.length > 15) return;

    if (keywords.some(k => messageText.includes(k))) {
      let chat, sender;
      try { chat = await event.message.getChat(); } catch {}
      try { sender = await event.message.getSender(); } catch {}

      const groupName = chat?.title || `[ID:${chat?.id}]`;
      const senderName = sender?.username ? `@${sender.username}` : sender?.id ? `[ID:${sender?.id}]` : "[UNKNOWN]";
      const msgLink = chat?.username
        ? `https://t.me/${chat.username}/${event.message.id}`
        : `[ID:${chat?.id}, msgId:${event.message.id}]`;
      const groupLink = chat?.username ? `https://t.me/${chat.username}` : `[ID:${chat?.id}]`;

      const text = `[⚡] ${senderName} | ${groupName}\n"${event.message.message}"\n🔗 ${msgLink}\n🌐 ${groupLink}`;
      await sendToGroup(targetGroupName, text);
    }
  } catch (err) {
    console.error("Ошибка мониторинга ключевых слов:", err);
  }
}, new NewMessage({ incoming: true }));

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
    console.log("✅ UserBot запущен! Скопируй STRING_SESSION в .env");
    console.log(stringSession);
  } else {
    await client.connect();
    console.log("✅ UserBot подключен с существующей сессией!");
  }
}

// ===== Главный запуск =====
(async () => {
  await startClient();
  broadcastFromMe();
})();

