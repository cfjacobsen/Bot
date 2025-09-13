// 💬 Código Node.js: chat entre ChatGPT e DeepSeek

js
require('dotenv').config();
const axios = require('axios');

const openaiKey = process.env.OPENAI_API_KEY;
const deepseekKey = process.env.DEEPSEEK_API_KEY;

const openaiURL = 'https://api.openai.com/v1/chat/completions';
const deepseekURL = 'https://api.deepseek.com/v1/chat/completions'; // ajuste conforme a API real

async function askChatGPT(message) {
  const response = await axios.post(openaiURL, {
    model: 'gpt-4',
    messages: [{ role: 'user', content: message}],
    max_tokens: 150
}, {
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json'
}
});
  return response.data.choices[0].message.content;
}

async function askDeepSeek(message) {
  const response = await axios.post(deepseekURL, {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: message}],
    max_tokens: 150
}, {
    headers: {
      'Authorization': `Bearer ${deepseekKey}`,
      'Content-Type': 'application/json'
}
});
  return response.data.choices[0].message.content;
}

async function iniciarConversa(assunto, rodadas = 3) {
  let mensagem = assunto;
  for (let i = 0; i < rodadas; i++) {
    const respostaGPT = await askChatGPT(mensagem);
    console.log(`🤖 ChatGPT: ${respostaGPT}`);

    const respostaDeepSeek = await askDeepSeek(respostaGPT);
    console.log(`🧠 DeepSeek: ${respostaDeepSeek}`);

    mensagem = respostaDeepSeek;
}
}

iniciarConversa("Qual é o impacto da inteligência artificial na educação?");
