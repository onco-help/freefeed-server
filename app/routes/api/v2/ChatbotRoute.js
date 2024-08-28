import {
  chatbot,
  pastMessages,
  resetChatbot,
} from '../../../controllers/api/v2/ChatbotController';

export default function addRoutes(app) {
  app.get('/chatbot', pastMessages);
  app.post('/chatbot', chatbot);
  app.post('/chatbot/reset', resetChatbot);
}
