import qrcode from "qrcode-terminal";
import whatsapp from "whatsapp-web.js";
import mongoose from "mongoose";
import { Message } from "./models.mjs";
import fs from "fs";
import crypto from "crypto";
import { join } from "path";
import mime from "mime-types";
import { fromUnixTime, intlFormat } from "date-fns";

const chatId = process.env.CHAT_ID;

const client = new whatsapp.Client({
  authStrategy: new whatsapp.LocalAuth(),
  puppeteer: { executablePath: "/bin/google-chrome-stable" },
});

mongoose.set("strictQuery", false);

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message_create", async (message) => {
  const isGroupChat = message.fromMe
    ? message.to === chatId
    : message.from === chatId;
  if (!isGroupChat) return;

  if (message.body === "!ping") {
    console.log(message);
    message.reply("pong");
  }

  if (message.body === "!memo") {
    sendRandomMemo(chatId);
  }

  if (message.body === "!salvar") {
    onSaveMessage(message);
  }
});

function onSaveMessage(message) {
  if (!message.hasQuotedMsg) return;

  message.reply("Salvando...");
  message
    .getQuotedMessage()
    .then((quotedMsg) => saveMessage(quotedMsg))
    .then(() => message.reply("*Sucesso*: Mensagem salva"))
    .catch((e) => {
      console.error(e);

      switch (e.message) {
        case "Message already saved":
          message.reply("*Erro*: A mensagem já foi salva");
          break;
        case "Could not download media":
          message.reply(
            "*Erro*: Não foi possível baixar o arquivo, envie novamente e salve a mensagem"
          );
          break;
        default:
          message.reply("*Erro*: Não foi possível salvar a mensagem");
          break;
      }
    });
}

async function saveMessage(message) {
  const existingMessage = await Message.findById(message.id.id);

  if (existingMessage != null) throw new Error("Message already saved");

  const createdOn = fromUnixTime(message.timestamp);
  const savedMessage = new Message({
    _id: message.id.id,
    groupId: message.from,
    authorId: message.authorId,
    authorName: message.notifyName || "Desconhecido",
    createdOn,
    message: message.body,
  });

  if (message.hasMedia) {
    const media = await message.downloadMedia();

    if (media == null) {
      throw new Error("Could not download media");
    }

    const buff = Buffer.from(media.data, "base64");
    const filepath = join(
      "files",
      `${crypto.randomUUID()}.${mime.extension(media.mimetype)}`
    );
    fs.writeFileSync(filepath, buff);

    savedMessage.media = filepath;
  }

  await savedMessage.save();
}

async function sendRandomMemo(chatId) {
  const message = (await Message.aggregate([{ $sample: { size: 1 } }]))?.[0];
  if (message == null) return;

  const messageBody = message.message.trim()
    ? `
---
${message.message}
---`
    : "";
  const sentMessage = await client.sendMessage(
    chatId,
    `*Memo diária*
Autor: ${message.authorName} 
Data: ${intlFormat(
      message.createdOn,
      {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      },
      {
        locale: "pt-BR",
      }
    )}:${messageBody}`
  );

  if (message.media != null) {
    const media = whatsapp.MessageMedia.fromFilePath(message.media);
    await sentMessage.reply("Arquivo anexado", undefined, { media });
  }
}

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/zuera");
  await client.initialize();
}

main();
