import { dbAdapter } from '../../../models';
import { ChatMessage } from '../../../models/chatMessage';
import { OpenAI } from 'openai';

const gptPrompts = {
  'default': 'You are a helpful assistant.',
  'support': 'You are a customer support assistant. Help the user with their issues.',
  'friend': 'You are a friendly chat companion. Engage in casual conversation.',
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
    model: 'gpt-3.5-turbo',
    messages: gptInput,
  });

  const message = response.data.choices[0].message.content;

  // Create a new ChatMessage
  const chatMessage = new ChatMessage(chat_id, new Date().toISOString(), message, 'bot', '');

  // Save the new ChatMessage
  await saveChatMessage(chatMessage);

  ctx.body = chatMessage;
}

export async function pastMessages(ctx) {
  // const { chat_id } = ctx.request.body;
  // const messages = await loadPreviousMessages(chat_id);
  messages = [
    { role: 'assistant', content: 'Hello! How can I help you today?' },
    { role: 'user', content: 'I need help with my order.' },
    { role: 'assistant', content: 'Sure! What seems to be the problem?' },
  ];
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
  // Implement this function to save the chat message to the database
}
