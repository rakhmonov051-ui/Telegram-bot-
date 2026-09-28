const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const db = require("./db");

const BOT_TOKEN = "8869367317:AAFSeWv_FmMd-kyWqpvbt2j_nXODQdlY9Hg";

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 },
  },
});

bot.on("polling_error", (err) => {
  console.log("Xato:", err.message);
});

// Til kodlari
const LANGUAGES = {
  "🇺🇿 O'zbekcha": "uz",
  "🇷🇺 Ruscha": "ru",
  "🇬🇧 Inglizcha": "en",
  "🇰🇬 Qirg'izcha": "ky",
};

const LANG_NAMES = {
  uz: "🇺🇿 O'zbekcha",
  ru: "🇷🇺 Ruscha",
  en: "🇬🇧 Inglizcha",
  ky: "🇰🇬 Qirg'izcha",
};

// Ro'yxatdan o'tish holati
const registrationState = {};
// Tarjima holati: { chatId: { from, to } }
const translateState = {};

// ─── /start ──────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const user = db.getUser(chatId);

  if (user) {
    bot.sendMessage(
      chatId,
      `👋 Xush kelibsiz, <b>${user.firstName} ${user.lastName}</b>!\n\n` +
        `Men tarjimon botman. Quyidagi tillarni qo'llab-quvvatlayman:\n` +
        `🇺🇿 O'zbek | 🇷🇺 Rus | 🇬🇧 Ingliz | 🇰🇬 Qirg'iz`,
      { parse_mode: "HTML", reply_markup: mainMenu() }
    );
  } else {
    registrationState[chatId] = { step: "firstName", data: {} };
    bot.sendMessage(
      chatId,
      `🌍 Salom! Men <b>TarjimonBot</b>man.\n\n` +
        `O'zbek, Rus, Ingliz va Qirg'iz tillarida tarjima qilaman.\n\n` +
        `Avval ismingizni kiriting:`,
      { parse_mode: "HTML" }
    );
  }
});

// ─── /profile ────────────────────────────────────────────────────────────────
bot.onText(/\/profile/, (msg) => {
  const chatId = msg.chat.id;
  showProfile(chatId);
});

// ─── /myid ───────────────────────────────────────────────────────────────────
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Chat ID: <code>${msg.chat.id}</code>`, { parse_mode: "HTML" });
});

// ─── Xabar handler ───────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  // Ro'yxatdan o'tish
  if (registrationState[chatId]) {
    return handleRegistration(chatId, text);
  }

  // Tarjima holati — matn kiritilmoqda
  if (translateState[chatId] && translateState[chatId].waitingText) {
    return handleTranslateInput(chatId, text);
  }

  // Menyu tugmalari
  switch (text) {
    case "🌍 Tarjima qilish":
      return showFromLang(chatId);
    case "👤 Profilim":
      return showProfile(chatId);
    case "🔄 Profilni yangilash":
      return startReRegistration(chatId);
    case "📖 Tillar haqida":
      return showLanguageInfo(chatId);
    case "⬅️ Orqaga":
      return bot.sendMessage(chatId, "Bosh menyu:", { reply_markup: mainMenu() });
  }

  // Til tanlash — qaysi tildan
  if (LANGUAGES[text]) {
    const fromLang = LANGUAGES[text];
    if (translateState[chatId] && translateState[chatId].step === "from") {
      translateState[chatId].from = fromLang;
      translateState[chatId].step = "to";
      return showToLang(chatId, fromLang);
    }
    if (translateState[chatId] && translateState[chatId].step === "to") {
      const toLang = LANGUAGES[text];
      if (toLang === translateState[chatId].from) {
        return bot.sendMessage(chatId, "⚠️ Bir xil tilni tanladingiz! Boshqa til tanlang.", {
          reply_markup: toLangMenu(translateState[chatId].from),
        });
      }
      translateState[chatId].to = toLang;
      translateState[chatId].step = "text";
      translateState[chatId].waitingText = true;
      return bot.sendMessage(
        chatId,
        `✅ Tayyor!\n\n` +
          `${LANG_NAMES[translateState[chatId].from]} → ${LANG_NAMES[toLang]}\n\n` +
          `Tarjima qilmoqchi bo'lgan matnni yuboring:`,
        { parse_mode: "HTML", reply_markup: { keyboard: [["⬅️ Orqaga"]], resize_keyboard: true } }
      );
    }
  }
});

// ─── Tarjima ──────────────────────────────────────────────────────────────────
function showFromLang(chatId) {
  const user = db.getUser(chatId);
  if (!user) return askRegister(chatId);

  translateState[chatId] = { step: "from" };
  bot.sendMessage(chatId, `🌐 Qaysi tildan tarjima qilmoqchisiz?`, {
    reply_markup: langMenu(),
  });
}

function showToLang(chatId, fromLang) {
  bot.sendMessage(
    chatId,
    `✅ ${LANG_NAMES[fromLang]} tanlandi.\n\nQaysi tilga tarjima qilmoqchisiz?`,
    { parse_mode: "HTML", reply_markup: toLangMenu(fromLang) }
  );
}

function toLangMenu(excludeLang) {
  const keys = Object.entries(LANGUAGES)
    .filter(([, code]) => code !== excludeLang)
    .map(([label]) => [label]);
  keys.push(["⬅️ Orqaga"]);
  return { keyboard: keys, resize_keyboard: true };
}

async function handleTranslateInput(chatId, text) {
  if (text === "⬅️ Orqaga") {
    delete translateState[chatId];
    return bot.sendMessage(chatId, "Bosh menyu:", { reply_markup: mainMenu() });
  }

  const state = translateState[chatId];
  translateState[chatId].waitingText = false;

  bot.sendMessage(chatId, `⏳ Tarjima qilinmoqda...`);

  try {
    const translated = await translateText(text, state.from, state.to);

    bot.sendMessage(
      chatId,
      `${LANG_NAMES[state.from]} → ${LANG_NAMES[state.to]}\n\n` +
        `📝 <b>Asl matn:</b>\n${text}\n\n` +
        `✅ <b>Tarjima:</b>\n<code>${translated}</code>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            ["🔄 Yana shu tilga tarjima"],
            ["🌍 Tarjima qilish", "⬅️ Orqaga"],
          ],
          resize_keyboard: true,
        },
      }
    );

    // Yana shu tilga tarjima
    translateState[chatId] = { ...state, waitingText: false };

    bot.once("message", (msg) => {
      if (msg.chat.id !== chatId) return;
      if (msg.text === "🔄 Yana shu tilga tarjima") {
        translateState[chatId] = { ...state, waitingText: true };
        bot.sendMessage(chatId, `Yangi matnni yuboring (${LANG_NAMES[state.from]} → ${LANG_NAMES[state.to]}):`, {
          parse_mode: "HTML",
          reply_markup: { keyboard: [["⬅️ Orqaga"]], resize_keyboard: true },
        });
      }
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Tarjima xatoligi: ${err.message}`, { reply_markup: mainMenu() });
    delete translateState[chatId];
  }
}

// MyMemory API (bepul, ro'yxatdan o'tish shart emas)
async function translateText(text, from, to) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await axios.get(url);
  if (res.data.responseStatus !== 200) throw new Error("Tarjima amalga oshmadi");
  return res.data.responseData.translatedText;
}

// ─── Tillar haqida ma'lumot ───────────────────────────────────────────────────
function showLanguageInfo(chatId) {
  const info =
    `📖 <b>Qo'llab-quvvatlanadigan tillar</b>\n\n` +
    `🇺🇿 <b>O'zbekcha</b>\n` +
    `  Ona tili: O'zbekiston\n` +
    `  So'zlovchilar: ~35 million\n\n` +
    `🇷🇺 <b>Ruscha</b>\n` +
    `  Ona tili: Rossiya va MDH\n` +
    `  So'zlovchilar: ~258 million\n\n` +
    `🇬🇧 <b>Inglizcha</b>\n` +
    `  Ona tili: AQSh, Britaniya va boshqalar\n` +
    `  So'zlovchilar: ~1.5 milliard\n\n` +
    `🇰🇬 <b>Qirg'izcha</b>\n` +
    `  Ona tili: Qirg'iziston\n` +
    `  So'zlovchilar: ~4.5 million`;

  bot.sendMessage(chatId, info, { parse_mode: "HTML", reply_markup: mainMenu() });
}

// ─── Ro'yxatdan o'tish ───────────────────────────────────────────────────────
function handleRegistration(chatId, text) {
  const state = registrationState[chatId];

  if (state.step === "firstName") {
    state.data.firstName = text.trim();
    state.step = "lastName";
    bot.sendMessage(chatId, `✅ Yaxshi, <b>${state.data.firstName}</b>!\n\nFamiliyangizni kiriting:`, {
      parse_mode: "HTML",
    });
  } else if (state.step === "lastName") {
    state.data.lastName = text.trim();
    state.step = "phone";
    bot.sendMessage(chatId, `📞 Telefon raqamingizni kiriting (+998XXXXXXXXX):`, {
      reply_markup: {
        keyboard: [[{ text: "📱 Raqamni ulashish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  } else if (state.step === "phone") {
    state.data.phone = text.trim();
    state.step = "age";
    bot.sendMessage(chatId, `🎂 Yoshingizni kiriting:`, {
      reply_markup: { remove_keyboard: true },
    });
  } else if (state.step === "age") {
    state.data.age = text.trim();
    state.step = "language";
    bot.sendMessage(chatId, `🌐 Ona tilingizni tanlang:`, {
      reply_markup: langMenu(),
    });
  } else if (state.step === "language") {
    if (LANGUAGES[text]) {
      state.data.nativeLang = LANGUAGES[text];
      finishRegistration(chatId, state.data);
    } else {
      bot.sendMessage(chatId, `⚠️ Iltimos, quyidagi tillardan birini tanlang:`, {
        reply_markup: langMenu(),
      });
    }
  }
}

bot.on("contact", (msg) => {
  const chatId = msg.chat.id;
  const state = registrationState[chatId];
  if (state && state.step === "phone") {
    state.data.phone = msg.contact.phone_number;
    state.step = "age";
    bot.sendMessage(chatId, `✅ Telefon saqlandi!\n\n🎂 Yoshingizni kiriting:`, {
      reply_markup: { remove_keyboard: true },
    });
  }
});

function finishRegistration(chatId, data) {
  const user = db.saveUser(chatId, {
    ...data,
    registeredAt: new Date().toLocaleDateString("uz-UZ"),
  });
  delete registrationState[chatId];

  bot.sendMessage(
    chatId,
    `🎉 <b>Ro'yxatdan o'tdingiz!</b>\n\n` +
      `Xush kelibsiz, <b>${user.firstName} ${user.lastName}</b>! 👋\n\n` +
      `Ona tilingiz: ${LANG_NAMES[user.nativeLang]}\n\n` +
      `Endi tarjima qilishni boshlashingiz mumkin!`,
    { parse_mode: "HTML", reply_markup: mainMenu() }
  );
}

function startReRegistration(chatId) {
  db.deleteUser(chatId);
  registrationState[chatId] = { step: "firstName", data: {} };
  bot.sendMessage(chatId, `🔄 Profilni yangilayapmiz.\n\nYangi ismingizni kiriting:`, {
    reply_markup: { remove_keyboard: true },
  });
}

// ─── Profil ───────────────────────────────────────────────────────────────────
function showProfile(chatId) {
  const user = db.getUser(chatId);
  if (!user) return askRegister(chatId);

  bot.sendMessage(
    chatId,
    `👤 <b>Sizning profilingiz</b>\n\n` +
      `📛 Ism: <b>${user.firstName}</b>\n` +
      `📛 Familiya: <b>${user.lastName}</b>\n` +
      `📞 Telefon: <b>${user.phone}</b>\n` +
      `🎂 Yosh: <b>${user.age}</b>\n` +
      `🌐 Ona tili: <b>${LANG_NAMES[user.nativeLang] || user.nativeLang}</b>\n` +
      `📅 Ro'yxatdan o'tgan: <b>${user.registeredAt}</b>`,
    { parse_mode: "HTML", reply_markup: mainMenu() }
  );
}

// ─── Yordamchi ────────────────────────────────────────────────────────────────
function mainMenu() {
  return {
    keyboard: [
      ["🌍 Tarjima qilish"],
      ["📖 Tillar haqida", "👤 Profilim"],
      ["🔄 Profilni yangilash"],
    ],
    resize_keyboard: true,
  };
}

function langMenu() {
  return {
    keyboard: [
      ["🇺🇿 O'zbekcha", "🇷🇺 Ruscha"],
      ["🇬🇧 Inglizcha", "🇰🇬 Qirg'izcha"],
      ["⬅️ Orqaga"],
    ],
    resize_keyboard: true,
  };
}

function askRegister(chatId) {
  bot.sendMessage(chatId, `⚠️ Avval ro'yxatdan o'ting. /start buyrug'ini yuboring.`);
}

console.log("🌍 TarjimonBot ishga tushdi...");