CHATBOT_URL = process.env.CHATBOT_URL || "http://localhost:8080";

export async function chatbot(ctx) {
  result = await fetch(CHATBOT_URL + "/messages", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      UserID: ctx.state.user.id,
      Message: ctx.request.body.input,
    }),  
  });
  ctx.body = await result.json();
}

export async function pastMessages(ctx) {
  result = await fetch(CHATBOT_URL + "/messages?userId=" + ctx.state.user.id);
  resultJson = await result.json();
  ctx.body = resultJson;
}
