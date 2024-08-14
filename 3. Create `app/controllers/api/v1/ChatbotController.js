import { ChatMessage } from '../../models/chatMessage';
import { OpenAIApi, Configuration } from 'openai';

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

export async function chatbot(ctx) {
  const { chat_id, input } = ctx.request.body;

  // Load all previous ChatMessages
  const previousMessages = await loadPreviousMessages(chat_id);

  // Send them to OpenAI API
  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: previousMessages.concat([{ role: 'user', content: input }]),
  });

  const message = response.data.choices[0].message.content;

  // Create a new ChatMessage
  const chatMessage = new ChatMessage(chat_id, new Date().toISOString(), message, 'bot', '');

  // Save the new ChatMessage
  await saveChatMessage(chatMessage);

  ctx.body = chatMessage;
}

async function loadPreviousMessages(chat_id) {
  // Implement this function to load previous messages from the database
  return [];
}

async function saveChatMessage(chatMessage) {
  // Implement this function to save the chat message to the database
}
