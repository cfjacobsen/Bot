// backtest.mjs
import fs from 'fs/promises';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  saldoUSDT: 1000,
  saldoBTC: 0,
  taxa: 0.001,
  lucroAlvoDia: 0.01,
  lucroMinimoVenda: 0.004,
  rsiPeriodo: 14,
  emaCurto: 9,
  emaLongo: 21
};

let estado = {
  saldoUSDT: config.saldoUSDT,
  saldoBTC: config.saldoBTC,
  lucroDia: 0,
  trades: 0,
  rsi: 50,
  emaCurto: 0,
  emaLongo: 0,
  precoRef: 0,
  emOperacao: false,
  ultimaCompra: null,
  historicoPrecos: []
};

function calcularEMA(precos, periodo, anterior = null) {
  const k = 2 / (periodo + 1);
  return precos.reduce((ema, p) => p * k + ema * (1 - k), anterior || precos[0]);
}

function calcularRSI(precos, periodo = 14) {
  if (precos.length < periodo + 1) return 50;
  let ganhos = 0, perdas = 0;
  for (let i = 1; i <= periodo; i++) {
    const dif = precos[i] - precos[i - 1];
    dif > 0 ? ganhos += dif : perdas -= dif;
  }
  const rs = ganhos / (perdas || 1);
  return 100 - (100 / (1 + rs));
}

function registrarCompra(preco, timestamp) {
  const qtd = estado.saldoUSDT / preco;
  const taxa = qtd * preco * config.taxa;
  estado.saldoBTC = qtd;
  estado.saldoUSDT = 0;
  estado.emOperacao = true;
  estado.ultimaCompra = preco;
  estado.trades++;
  console.log(`[${timestamp}] COMPRA: ${qtd.toFixed(6)} BTC @ ${preco.toFixed(2)} USDT`);
}

function registrarVenda(preco, timestamp) {
  const valor = estado.saldoBTC * preco;
  const taxa = valor * config.taxa;
  const lucro = valor - taxa - estado.ultimaCompra * estado.saldoBTC;
  estado.saldoUSDT = valor - taxa;
  estado.lucroDia += lucro;
  estado.saldoBTC = 0;
  estado.emOperacao = false;
  estado.trades++;
  console.log(`[${timestamp}] VENDA: Lucro ${lucro.toFixed(2)} USDT | Total: ${estado.saldoUSDT.toFixed(2)}`);
}

async function executarBacktest() {
  const arquivo = path.join(__dirname, 'btc_1min_simulado.csv');
  const rl = readline.createInterface({
    input: (await fs.open(arquivo)).createReadStream(),
    crlfDelay: Infinity
  });

  let linhas = 0;
  for await (const linha of rl) {
    if (++linhas === 1) continue; // pular cabeçalho
    const [timestamp, open, high, low, closeStr, volume] = linha.split(',');
    const preco = parseFloat(closeStr);
    if (!preco || preco <= 0) continue;

    estado.historicoPrecos.push(preco);
    if (estado.historicoPrecos.length > 100) estado.historicoPrecos.shift();

    estado.rsi = calcularRSI(estado.historicoPrecos, config.rsiPeriodo);
    estado.emaCurto = calcularEMA(estado.historicoPrecos.slice(-config.emaCurto), config.emaCurto, estado.emaCurto);
    estado.emaLongo = calcularEMA(estado.historicoPrecos.slice(-config.emaLongo), config.emaLongo, estado.emaLongo);

    const condCompra = !estado.emOperacao && estado.rsi < 40 && estado.emaCurto > estado.emaLongo;
    const condVenda = estado.emOperacao && preco > estado.ultimaCompra * (1 + config.lucroMinimoVenda);

    if (condCompra) registrarCompra(preco, timestamp);
    else if (condVenda) registrarVenda(preco, timestamp);
  }

  console.log(`\nResumo:`);
  console.log(`Lucro total: ${estado.lucroDia.toFixed(2)} USDT`);
  console.log(`Trades realizados: ${estado.trades}`);
  console.log(`Saldo final USDT: ${estado.saldoUSDT.toFixed(2)}`);
}

executarBacktest();
