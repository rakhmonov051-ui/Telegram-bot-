const fs = require("fs");
const path = require("path");
const DB_FILE = path.join(__dirname, "users.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(chatId) {
  return loadDB()[String(chatId)] || null;
}

function saveUser(chatId, userData) {
  const db = loadDB();
  db[String(chatId)] = userData;
  saveDB(db);
  return userData;
}

function deleteUser(chatId) {
  const db = loadDB();
  delete db[String(chatId)];
  saveDB(db);
}

function getAllUsers() {
  const data = loadDB();
  return Object.entries(data).map(([chatId, user]) => ({ ...user, chatId }));
}

module.exports = { getUser, saveUser, deleteUser, getAllUsers };