import fs from "fs";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import input from "input";

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
let stringSession = "1BAAOMTQ5LjE1NC4xNjcuOTEAUAP/1iTvygR2uwvTNCESiNSmSL7MCFajsk9HqvEy/msnsPnirR8ysEe1xAalv5qAhv4s5XGYngLEtJWZv3BiPbS3pkdqUgc8OWXpHHn6lP4Al13lL2Mqp0es//XKW3cLZhRDR9+y+ytDoxMq5HZI1kIOHxCItSX3jUH0TaQG89FGaI/5Rkjo2wIy70Eqx3TT9JUpEizM25hL0nITN+63UZr2kHMg+8oXOLLa55avHmjBVXu3X3kGyDY8wKAOmnfJvcw8pVX3lW+5rzJi6OE8HfnW9b0yDC2i+OU9utlmNGpdCHuH/lNo53fHVj7C0AtxB3QMHYdwjUWU/sjKCW/+QUA=";
// if (fs.existsSync(sessionFile)) {
//     stringSession = fs.readFileSync(sessionFile, "utf-8");
// }
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

        let groupLink = "[UNKNOWN CHAT]";
        try {
            const chat = await event.message.getChat();
            if (chat && chat.username) groupLink = `https://t.me/${chat.username}`;
            else if (chat && chat.title) groupLink = `${chat.title} [PRIVATE GROUP]`;
            else groupLink = `[ID:${chat.id}]`;
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

        const noteText = `[⚡] Ключевое слово найдено в сообщении от ${senderName} в чате ${groupLink}: "${event.message.message}"`;
        console.log(noteText);
        addToGroup(noteText);

    } catch (error) {
        console.error("Ошибка обработки сообщения:", error);
    }
}, new NewMessage({ incoming: true }));