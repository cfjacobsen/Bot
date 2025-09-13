// gestor_bot.mjs
import fs from 'fs/promises';
import { spawn } from 'child_process';
import axios from 'axios';
import chokidar from 'chokidar';
import path from 'path';

// Caminho do seu bot
const BOT_FILE = path.resolve('./bot_agressivo6.mjs');
let botProcess = null;

// ======= FUNÇÃO: REINICIAR BOT =======
function restartBot() {
  if (botProcess) {
    console.log('Reiniciando bot...');
    botProcess.kill('SIGTERM');
  }
  botProcess = spawn('node', [BOT_FILE], { stdio: 'inherit' });
}

// ======= FUNÇÃO: ANÁLISE DE CÓDIGO =======
async function analyzeBotCode() {
  const code = await fs.readFile(BOT_FILE, 'utf-8');

  const [gptResp, dsResp] = await Promise.all([
    axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'Analise segurança, risco e eficiência do código.' },
          { role: 'user', content: code }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    ),
    axios.post(
      'https://api.deepseek.com/v1/chat/completions', // precisa confirmar o endpoint da sua conta
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Analise segurança, risco e eficiência do código.' },
          { role: 'user', content: code }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    )
  ]);

  const gptText = gptResp.data?.choices?.[0]?.message?.content || '';
  const dsText = dsResp.data?.choices?.[0]?.message?.content || JSON.stringify(dsResp.data);

  return { gpt: gptText, ds: dsText };
}

// ======= FUNÇÃO: CONSENSO ENTRE IAs =======
function getConsensus(gptText, dsText) {
  return {
    seguranca: `${gptText}\n---\n${dsText}`,
    eficiencia: `${gptText}\n---\n${dsText}`,
    risco: `${gptText}\n---\n${dsText}`
  };
}

// ======= FUNÇÃO: EDITAR E REINICIAR =======
async function applyChanges(changes) {
  let code = await fs.readFile(BOT_FILE, 'utf-8');
  // Apenas insere comentário por enquanto
  code = `// Alterado automaticamente em ${new Date().toISOString()}\n` + code;
  await fs.writeFile(BOT_FILE, code, 'utf-8');
  restartBot();
}

// ======= MONITORAMENTO DE ARQUIVO =======
chokidar.watch(BOT_FILE).on('change', () => {
  console.log('Arquivo alterado, reiniciando...');
  restartBot();
});

// ======= CICLO PRINCIPAL =======
async function mainLoop() {
  restartBot();

  setInterval(async () => {
    try {
      const { gpt, ds } = await analyzeBotCode();
      const consensus = getConsensus(gpt, ds);

      console.log('--- Consenso IA ---');
      console.log(consensus);

      // Regra simples: se falarem em "otimizar", aplica mudança
      if (consensus.eficiencia.toLowerCase().includes('otimizar')) {
        await applyChanges(consensus);
      }
    } catch (err) {
      console.error('Erro no ciclo principal:', err.message);
    }
  }, 3600 * 1000); // roda a cada 1h
}

mainLoop();
