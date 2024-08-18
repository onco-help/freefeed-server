import { dbAdapter } from '../../../models';
import { Chat } from '../../../models/chat';
import { ChatMessage } from '../../../models/chatMessage';
import { OpenAI } from 'openai';

const gptPrompts = {
  'default': 'Веди себя как компаньон для онкопациента с раком молочной железы. Твоя задача - узнать у пользователя его (1) возраст, (2) тип рака, (3) функциональный статус (ECOG), обрисовать ему "дорожную карту" дальнейших действий и в зависимости от этапа, напоминать о следующих шагах, спрашивать и учитывать дополнительную информацию, и удостовериться, что протоколы обследования и лечения соответствуют общепринятым практикам и не включают бесполезных препаратов или процедур. В этапах не перечисляй все этапы до конца, остановись на n+1, где n - текущий этап на котором находится пациент. Также, пожалуйста, приводи расшифровки, переводы и определения всех специальных терминов и аббревиатур, используемых тобой или пользователем, описанные "ELI5" понятным языком. Задавай вопросы по одному, чтобы не перегружать пользователя, и выдавай новую порцию информации только после получения всех данных. Если ожидаешь ответа из конкретного списка, выведи в конце сообщения кнопки с вариантами ответа в формате: {"Да", "Нет", "Не знаю"}, отделённые пустой строкой от самого ответа. Если пользователь ответил на вопрос, но не предоставил необходимую информацию, попроси его уточнить.',
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function chatbot(ctx) {
  const { chat_id, input, chat_type = 'default' } = ctx.request.body;

  // Load all previous ChatMessages
  const previousMessages = await loadPreviousMessages(chat_id);

  // Build the GPT input
  const prompt = gptPrompts[chat_type] || gptPrompts['default'];
  const gptInput = [{ role: 'system', content: prompt }]
    .concat(previousMessages)
    .concat([{ role: 'user', content: input }]);

  // Send the input to OpenAI API
  const response = await openai.createChatCompletion({
    model: 'gpt-4o',
    messages: gptInput,
  });

  const message = response.data.choices[0].message.content;

  const userMessage = new ChatMessage(chat_id, new Date().toISOString(), input, 'user');
  await saveChatMessage(userMessage);

  // Create a new ChatMessage
  const lastLine = message.split('\n').pop();
  const buttons = lastLine.match(/\{.*\}/);
  const buttonsStr = ""
  if (buttons) {
    message = message.replace(buttons[0], '');
    buttonsStr = buttons[0].slice(1, -1);
  }
  const chatMessage = new ChatMessage(chat_id, new Date().toISOString(), message, 'bot', buttonsStr);
  await saveChatMessage(chatMessage);

  // todo: handle buttons

  ctx.body = chatMessage;
}

export async function pastMessages(ctx) {
  const { chat_id } = ctx.request.body;
  if (!chat_id) {
    const user = ctx.state.user;
    // generate random UUID
    const chat = dbAdapter.getChat(user, 'default');
    if (!chat) {
      const chat_id = 'chat-' + Math.random().toString(36).substring(2);
      chat = new Chat(user, chat_id, 'default');
      dbAdapter.createChat(chat);
    }
    chat_id = chat.uuid;
  }
  const messages = await loadPreviousMessages(chat_id);
  ctx.body = { messages: messages };
}

async function loadPreviousMessages(chat_id) {
  const messages = await dbAdapter.getChatMessages(chat_id);
  return messages.map(msg => ({
    role: msg.author === 'bot' ? 'assistant' : 'user',
    content: msg.message,
  }));
}

async function saveChatMessage(chatMessage) {
  await dbAdapter.createChatMessage(chatMessage);
}
