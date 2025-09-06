import "dotenv/config";
import fs from "fs";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import input from "input";
import { config } from "dotenv";

// === Настройки ===
const apiId = 23786159;
const apiHash = "6ed0b3de382c59f83fe872a9a32dfa2c";
const sessionFile = "./session.txt";
const targetGroupName = "xxx"
// const notesFile = "./notes.txt";
const keywords = [
    'нужнышш', 'шш', 'шишки', 'шишку', 'шишка', 'шмаль', 'стафчик', 'стафф', 'skero', 'weed',
    'бошки', 'плюшки', 'бух', 'драпчик', 'напас', 'банка', 'хапануть',
    'хапнуть', 'курнуть', 'укуриться',

];

// Загружаем сессию, если есть
let stringSession = process.env.STRING_SESSION || "";

const client = new TelegramClient(new StringSession(stringSession), apiId, apiHash, { connectionRetries: 5 });


// Функция записи в группу
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

// Старт клиента
(async () => {
    // Если stringSession пустой, просим залогиниться
    if (!stringSession || stringSession.trim() === "") {
        await client.start({
            phoneNumber: async () => await input.text("Введите номер телефона: "),
            password: async () => await input.text("Введите пароль: "),
            phoneCode: async () => await input.text("Введите код из Telegram: "),
            onError: (err) => console.log(err),
        });

        stringSession = client.session.save();
        fs.writeFileSync(sessionFile, stringSession);
        console.log("UserBot запущен! Сессия сохранена.");
    } else {
        // Если сессия уже есть, просто подключаемся
        await client.connect();
        console.log("UserBot запущен с существующей сессией!");
    }
})();

// ====== Обработчик новых сообщений (главная логика поиска) ======
client.addEventHandler(async (event) => {
    try {
        const message = event.message.message?.toLowerCase();
        if (!message || message.length > 20) return; // фильтр мусора
        if (!keywords.some(word => message.includes(word))) return;

        let messageLink = "[UNKNOWN CHAT]";
        try {
            const chat = await event.message.getChat();
            if (chat && chat.username) {
                // Публичная группа или канал
                messageLink = `https://t.me/${chat.username}/${event.message.id}`;
            } else if (chat && chat.title) {
                // Приватная группа — ссылки на сообщение не сделать
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