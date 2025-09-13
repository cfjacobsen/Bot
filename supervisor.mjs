// supervisor.mjs
import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { IAChat } from './iaChat.mjs'; // Classe que você já tem

let botProcess = null;
const iaChat = new IAChat();

function startBot() {
  if (botProcess) botProcess.kill();
  botProcess = spawn('node', ['bot_agressivo5.mjs'], { stdio: 'inherit' });
}

const app = express();
app.use(express.json());

// Editar .env dinamicamente
app.post('/update-env', async (req, res) => {
  const envPath = path.resolve('.env');
  const updates = req.body; // { RSI_BUY_LIMIT: "35", INTERVALO_MS: "2000" }
  let env = await fs.readFile(envPath, 'utf8');
  
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(env)) {
      env = env.replace(regex, `${key}=${value}`);
    } else {
      env += `\n${key}=${value}`;
    }
  }
  await fs.writeFile(envPath, env);
  res.json({ status: 'ok', updates });
});

// Atualizar código-fonte e reiniciar
app.post('/update-code', async (req, res) => {
  const filePath = path.resolve('bot_agressivo5.mjs');
  await fs.writeFile(filePath, req.body.code, 'utf8');
  startBot();
  res.json({ status: 'ok', msg: 'Código atualizado e bot reiniciado' });
});

// Reiniciar manualmente
app.post('/restart', (req, res) => {
  startBot();
  res.json({ status: 'ok', msg: 'Bot reiniciado' });
});

// Analisar estado com IA
app.post('/analisar', async (req, res) => {
  const estadoPar = req.body.estado;
  const analise = await iaChat.obterRecomendacaoConsolidada(estadoPar);
  res.json(analise);
});

app.listen(3000, () => {
  console.log("Supervisor rodando em http://localhost:3000");
  startBot();
});
