import { type DbAdapter } from './index';
import { UUID } from '../types';

export default function chatsMessages(superClass: typeof DbAdapter): typeof DbAdapter {
  return class extends superClass {
    async createChat(userId: UUID, chatType: UUID): Promise<UUID> {
      const chatId = await this.database.getOne(
        `insert into chats (user_id, chat_type) values (:userId, :chatType) returning id`,
        { userId, chatType },
      );

      return chatId;
    }

    async createChatMessage(chatId: UUID, message: string, buttons: string): Promise<void> {
      return await this.database.raw(
        `insert into chat_messages (chat_id, message, buttons) values (:chatId, :message, :buttons)`,
        { chatId, message, buttons },
      );
    }
    
    async getChatMessages(chatId: UUID): Promise<{ userId: UUID, message: string, createdAt: Date }[]> {
      return await this.database.getAll(
        `select user_id, message, created_at from chat_messages where chat_id = :chatId`,
        { chatId },
      );
    }

    async getChat(userId: UUID, type: string): Promise<{ userId: UUID, chatId: UUID, chatType: string }> {
      return await this.database.getOne(
        `select user_id, chat_id, chat_type from chats where user_id = :userId and type = :type`,
        { userId, type },
      );
    }
  };
}
