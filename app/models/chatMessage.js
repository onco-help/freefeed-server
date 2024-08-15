export class ChatMessage {
  constructor(chat, timestamp, message, author, controls) {
    this.chat = chat;
    this.timestamp = timestamp;
    this.message = message;
    this.author = author;
    this.controls = controls;
  }
}
