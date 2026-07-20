-- Dashboard AI chat is removed. Drop the supporting tables.
-- Idempotent so a fresh DB (which never created them) is fine too.
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_rules;
