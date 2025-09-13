import { Bot } from './bot_agressivo(5).mjs';

const simbolo = 'BTCUSDT';
const precoAtual = 115000.00;
const qtd = 0.0004;

// Simulação de um estado fictício
const estadoSimulado = {
  healthCheck: {},
  saldo: {
    BTC: 0.01,
    USDT: 100,
  }
};

await Bot.executarCompra(simbolo, estadoSimulado, precoAtual, qtd, 'TESTE_MANUAL');
