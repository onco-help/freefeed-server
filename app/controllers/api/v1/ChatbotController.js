import dbAdapter from '../../support/DbAdapter';

export async function getChatMessages(ctx) {
  const chat_id = ctx.query.chat_id;
  const messages = await dbAdapter.getChatMessages(chat_id);
  ctx.body = messages.map(msg => ({
    role: msg.author === 'bot' ? 'assistant' : 'user',
    content: msg.message,
  }));
}

export async function postChatMessage(ctx) {
  const { chat_id, author, message } = ctx.request.body;
  await dbAdapter.saveChatMessage({ chat_id, author, message });
  ctx.status = 201;
}
