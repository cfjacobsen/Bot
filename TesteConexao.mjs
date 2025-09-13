import axios from 'axios';
import 'dotenv/config';

async function testarAPIs() {
  try {
    // Testar OpenAI
    const respostaOpenAI = await axios.post('https://api.openai.com/v1/models', {}, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    console.log('✅ OpenAI API conectada com sucesso');
    
    // Testar DeepSeek (ajuste a URL conforme a documentação oficial)
    const respostaDeepSeek = await axios.get('https://api.deepseek.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      }
    });
    console.log('✅ DeepSeek API conectada com sucesso');
    
  } catch (erro) {
    console.error('❌ Erro ao conectar com as APIs:', erro.message);
  }
}

testarAPIs();