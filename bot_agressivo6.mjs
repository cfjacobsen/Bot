process.env['TF_CPP_MIN_LOG_LEVEL'] = '2'; // Suprime avisos do TensorFlow
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs/promises';
import chalk from 'chalk';
import fetch from 'node-fetch';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import http from 'http';
import brain from 'brain.js';
import { createTransport } from 'nodemailer';
import dns from 'dns';
import * as tf from '@tensorflow/tfjs';
import ccxt from 'ccxt';
import axios from 'axios';
import net from 'node:net';

import { Binance } from './binance.mjs';
import { Technical } from './technical.mjs';

import express from 'express'; // Para o servidor de comandos opcional

// Garantir que estadoPar esteja sempre acessível e inicializado
global.estadoPar = global.estadoPar || {};
global.estados = {};

async function haBNBSuficiente(estadoPar, minimo = config.MINIMO_BNB_TAXAS) {
  try {
    if (!config.USAR_BNB_PARA_TAXAS) return false;

    // SIMULAÇÃO: pega do estado
    if (config.SIMULA) {
      const saldoBNB = Number(estadoPar?.saldos?.BNB) || 0;
      return saldoBNB >= minimo;
    }

    // MODO REAL: consulta a API e atualiza cache local
    const saldoReal = await ConexaoAPI.obterSaldo('BNB', estadoPar);
    estadoPar.saldos.BNB = Number(saldoReal) || 0;
    return (estadoPar?.saldos?.BNB ?? 0) >= minimo;

  } catch (err) {
    await global.logger?.log(`[${estadoPar?.simbolo || '?'}] Falha ao checar BNB: ${err.message}`, 'ERRO');
    return false;
  }
}

// =======================
// 🖥️ FUNÇÃO DE EXIBIÇÃO
// =======================
function exibirResumoPar(par, estado) {
  const moedaBase = (typeof par === 'string' ? par : par.simbolo || '').replace('USDT', '');
  const emOperacao = estado.emOperacao ? chalk.yellowBright('SIM') : chalk.gray('NÃO');

//   console.log(chalk.bold.blue(`\n========================= RESUMO ${par} n=========================`));
//   console.log(chalk.bold.blue(`Preço Atual     : ${chalk.green(estado.precoAtual?.toFixed(2) || '-')}`));
//   console.log(chalk.bold.blue(`RSI             : ${chalk.magenta(estado.rsi?.toFixed(2) || '-')}`));
//   console.log(chalk.bold.blue(`EMA (Short/Long): ${chalk.cyan(`${estado.emaShort?.toFixed(2) || '-'} / ${estado.emaLong?.toFixed(2) || '-'}`)}`));
//   console.log(chalk.bold.blue(`Tendência       : ${chalk.yellow(estado.tendencia || '-')}`));
//   console.log(chalk.bold.blue(`Volatilidade    : ${chalk.white(`${(estado.volatilidade * 100).toFixed(2)}%`)}`));

//   console.log(chalk.bold.blue(`Saldo USDT      : ${chalk.white(`${estado.saldos?.USDT?.toFixed(2) || 0} USDT`)}`));
//   console.log(chalk.bold.blue(`Saldo ${moedaBase}    : ${chalk.white(`${estado.saldos?.[moedaBase]?.toFixed(6) || 0} ${moedaBase}`)}`));
//   console.log(chalk.bold.blue(`Lucro Acumulado : ${chalk.bold(estado.lucroAcumulado?.toFixed(2) || 0)} USDT`));
//   console.log(chalk.bold.blue(`Em Operação     : ${emOperacao}`));

//   console.log(chalk.bold.blue(('=================================================================\n')));
}

// ====================== CONSTANTES E CONFIGURAÇÕES ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIR_ESTADOS = path.join(__dirname, 'estados_pares');
const DIR_RECOMENDACOES = path.join(__dirname, 'recomendacoes_pares');
const ARQUIVO_SUSPENSOES = path.join(__dirname, 'suspensoes.json');
const ARQUIVO_PARAMETROS = path.join(__dirname, 'parametros.json');

const CAPITAL_INICIAL = 270; // USDT
// const META_DIARIA = 0.0061; // 0.61%
// const META_HORARIA_BASE = META_DIARIA / 24; // 0.0254%

const PARES_ATIVOS = (process.env.ATIVOS || 'BTCUSDT')
  .split(',')
  .map(p => p.trim().toUpperCase()); // você pode adicionar mais
const paresAtivos = PARES_ATIVOS; // Define a variável global
global.PARES_ATIVOS = PARES_ATIVOS;

const METAS_AGRESSIVAS = {
  META_DIARIA: 0.01, // 1% ao dia (mais que o solicitado)
  META_HORARIA_BASE: 0.0015, // 0.15% por hora (mais que 0.11%)
  TURBO_ATIVACAO: 0.0008, // Ativa turbo se abaixo de 0.08% na hora
  TURBO_MULTIPLICADOR: 2.5 // Aumenta posição em 150% no turbo
};

function getMoedaBase(simbolo) {
  if (!simbolo) return 'UNKNOWN';
  
  if (typeof simbolo === 'string') {
    return simbolo.replace('USDT', '');
  }
  
  if (simbolo.simbolo) {
    return simbolo.simbolo.replace('USDT', '');
  }
  
  if (simbolo.symbol) {
    return simbolo.symbol.replace('USDT', '');
  }
  
  return 'UNKNOWN';
}

global.getMoedaBase = getMoedaBase;

// Verificação de variáveis de ambiente
function verificarVariaveisAmbiente() {
  const obrigatorias = ['BINANCE_API_KEY', 'BINANCE_API_SECRET', 'TIMEZONE'];
  const faltando = obrigatorias.filter(v => !process.env[v] || process.env[v].trim() === '');
  
  if (faltando.length > 0) {
    console.error(chalk.red(`ERRO CRÍTICO: Variáveis faltando: ${faltando.join(', ')}`));
    process.exit(1);
  }
}
verificarVariaveisAmbiente();

const MODO_OPERACAO = process.env.USE_TESTNET === 'true' 
    ? (process.env.SIMULA === 'true' ? 'SIMULA' : 'TESTNET')
    : 'MAINNET';

const config = {
  SIMULA: process.env.SIMULA === 'true',
  SIMULACAO: {
         intervalo: 5000,
         quantidadePadrao: 0.001,
         urlBase: 'https://testnet.binance.vision/api'
    },
  TESTNET: {
        intervalo: 10000,
        quantidadePadrao: 0.01,
        urlBase: 'https://testnet.binance.vision/api'
    },
    MAINNET: {
        intervalo: 30000,
        quantidadePadrao: 0.1,
        urlBase: 'https://api.binance.com'
    },
  USE_TESTNET: process.env.USE_TESTNET === 'true' && process.env.SIMULA !== 'true',
  API_KEY: process.env.BINANCE_API_KEY.trim(),
  API_SECRET: process.env.BINANCE_API_SECRET.trim(),
  TIMEZONE: process.env.TIMEZONE || 'America/Sao_Paulo',
  INTERVALO: Math.max(500, parseInt(process.env.INTERVALO_MS || '1000')),
  RISK_PER_TRADE: Math.min(5, Math.max(0.1, parseFloat(process.env.RISK_PER_TRADE || '1.5'))),
  MAX_DRAWDOWN: Math.min(20, Math.max(1, parseFloat(process.env.MAX_DRAWDOWN || '5'))),
  MAX_TRADES_DIA: Math.min(200, Math.max(1, parseInt(process.env.MAX_TRADES_DIA || '100'))),
  SALDO_INICIAL_USDT: parseFloat(process.env.SALDO_USDT || CAPITAL_INICIAL.toString()),
  SALDO_INICIAL_BTC: parseFloat(process.env.SALDO_INICIAL_BTC || '0'),
  SALDO_INICIAL_ETH: parseFloat(process.env.SALDO_INICIAL_ETH || '0'),
  SALDO_INICIAL_SOL: parseFloat(process.env.SALDO_INICIAL_SOL || '0'),
  SALDO_INICIAL_BNB: parseFloat(process.env.SALDO_INICIAL_BNB || '0'),
  DELAY_INICIAL_MS: Math.max(0, parseInt(process.env.DELAY_INICIAL_SEGUNDOS || '0') * 1000),
  TAXA_MAKER: 0.001,
  TAXA_TAKER: 0.001,
  USAR_BNB_PARA_TAXAS: process.env.USAR_BNB_PARA_TAXAS === 'true',
  MINIMO_BNB_TAXAS: process.env.MINIMO_BNB_TAXAS || '0.25',
  SCALP_SPREAD_MINIMO: 0.0005,
  TAXA_DESCONTO_BNB: 0.25,
  VALOR_MINIMO_ORDEM: 10,
  BTC_PRECISION: 5,
  BTC_MIN_ORDER: 0.00001,
  LUCRO_DIARIO_ALVO: METAS_AGRESSIVAS.META_DIARIA,
  TAXA_MAX_PERMITIDA: 0.003,
  DRAWDOWN_RECUPERACAO: 0.02,
  MODO_RECUPERACAO: false,
  VOLUME_BASE: 70,
  USE_AI: process.env.USE_AI === 'true',
  VOLUME_MINIMO_URGENTE: parseFloat(process.env.VOLUME_MINIMO_URGENTE || '50000'),
  VOLUME_MINIMO_NORMAL: parseFloat(process.env.VOLUME_MINIMO_NORMAL || '100000'),
  VOLUME_MINIMO: {
    BTCUSDT: parseFloat(process.env.VOLUME_MINIMO_BTC || '1000000'),
    ETHUSDT: parseFloat(process.env.VOLUME_MINIMO_ETH || '500000'),
    SOLUSDT: parseFloat(process.env.VOLUME_MINIMO_SOL || '100000'),
    DEFAULT: parseFloat(process.env.VOLUME_MINIMO_NORMAL || '100000')
  },
  PERDA_DIARIA_MAXIMA: 0.02,
  META_MINIMA_DIARIA: 0.006,
  META_HORARIA: 0,
  HORA_ATUAL: new Date().getHours(),
  MINORDER: {
        BTC: 0.0001,
        ETH: 0.001,
        BNB: 0.01,
        SOL: 0.1,
        XRP: 10,
        DEFAULT: 10
  },
  precision: {
    BTC: 5,
    ETH: 4,
    SOL: 1,
    DEFAULT: 6
  }
};

// Inicializar Brian
const brian = new Brian(
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_SECRET_KEY,
    process.env.USE_TESTNET === 'true' 
        ? 'https://testnet.binance.vision' 
        : 'https://api.binance.com'
);

const { intervalo, quantidadePadrao, urlBase } = config[MODO_OPERACAO];
const binance = new Binance(process.env.BINANCE_API_KEY, process.env.BINANCE_SECRET_KEY, urlBase);
const technical = new Technical();

global.config = config;

const estrategia = {
  ATR_PERIOD: 14,
  RSI_PERIOD: 14,
  EMA_SHORT_PERIOD: 9,
  EMA_LONG_PERIOD: 21,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  RSI_COMPRA_MAX: parseInt(process.env.RSI_BUY_LIMIT || '40'),
  RSI_VENDA_MIN: 60,
  LUCRO_MINIMO: 1.005,
  STOP_LOSS_ATR_MULTIPLIER: 0.8,
  TAKE_PROFIT_ATR_MULTIPLIER: 1.8,
  SCALP_SPREAD_MINIMO: 0.0005,
  SCALP_LUCRO_MINIMO: 1.002,
  MAX_OPERACOES_DIA: parseInt(process.env.MAX_TRADES_DIA || '50'),
  TAMANHO_POSICAO: parseFloat(process.env.POSITION_SIZE || '0.05'),
  ESPERA_ENTRE_OPERACOES: parseInt(process.env.OPERATION_DELAY_MS || '3000'),
  LUCRO_RAPIDO_ALVO: 1.002,
  TEMPO_MAXIMO_HOLD: 120000,
  SCALP_RSI_MIN: 30,
  SCALP_VOL_MIN: 0.002,
  RECUPERACAO_RISCO: 3.0,
  RECUPERACAO_LUCRO_MIN: 1.002
};

global.estrategia = estrategia;

  // ====================== VARIÁVEIS PARA INTEGRAÇÃO COM SUPERVISORBOT ======================
  let estatisticas = {
      totalOperacoes: 0,
      operacoesLucro: 0,
      operacoesPrejuizo: 0,
      lucroTotal: 0,
      prejuizoTotal: 0,
      drawdownMaximo: 0
  };

  let parametros = {
      RSI_COMPRA_MAX: 70,
      RSI_VENDA_MIN: 30,
      STOP_LOSS: 0.95,
      TAKE_PROFIT: 1.05,
      VOLATILIDADE_MAXIMA: 0.03,
      INTERVALO_ANALISE: 60000
  };

  // ====================== FUNÇÃO AUXILIAR GLOBAL ======================
  function obterSimboloString(simbolo, estadoPar = null) {
    try {
      if (typeof simbolo === 'string') return simbolo;
      if (typeof simbolo === 'object') {
        if (simbolo.simbolo) return simbolo.simbolo;
        if (simbolo.symbol) return simbolo.symbol;
      }
      if (estadoPar && estadoPar.simbolo) return estadoPar.simbolo;
      return 'UNKNOWN';
    } catch (err) {
      console.error("Erro em obterSimboloString:", err);
      return 'ERROR';
    }
  }

  // Registro global garantido
  global.obterSimboloString = global.obterSimboloString || obterSimboloString

  // ⭐⭐ VERIFICAÇÃO CRÍTICA ⭐⭐
  if (typeof global.obterSimboloString !== 'function') {
    console.error("❌ ERRO CRÍTICO: Função obterSimboloString não está disponível!");
    
    // Fallback de emergência
    global.obterSimboloString = function(simbolo, estadoPar) {
      console.error("Fallback de símbolo ativado");
      return 'FALLBACK';
    };
  }

  // ====================== FUNÇÃO DE LOG DE ERROS ======================
  function logErroDetalhado(err, contexto = '') {
     const stackLines = err.stack?.split('\n') || [];
     const localErro = stackLines[1]?.trim() || 'local desconhecido';

     const mensagem = `\n[ERRO DETALHADO] ${contexto}
      → Mensagem: ${err.message}
      → Local: ${localErro}
     → Stack:
      ${stackLines.slice(1).join('\n')}\n`;

     console.error(chalk.bgRed.white(mensagem));
     if (global.logger && typeof global.logger.log === 'function') {
       global.logger.log(mensagem, 'ERRO');
     }
  }

// ====================== UTILITÁRIOS ======================
class Utils {
  static formatarData(data, formato = 'pt-BR', incluirMS = false) {
    const options = {
      timeZone: config.TIMEZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    if (incluirMS) options.fractionalSecondDigits = 3;
    return data.toLocaleString(formato, options);
  }

  static formatarTimestamp(timestamp, formato = 'pt-BR') {
    if (!timestamp) return 'Nunca';
    const d = new Date(timestamp);
    return isNaN(d) ? 'Nunca' : this.formatarData(d, formato);
  }

  static calcularHoraAtual() {
    return new Date().getHours();
  }
}

// testa se uma porta está disponível
async function findFreePortInRange(start, end, host = '127.0.0.1') {
  for (let port = start; port <= end; port++) {
    const available = await new Promise(resolve => {
      const tester = net.createServer()
        .once('error', () => resolve(false))          // EADDRINUSE, EACCES, etc.
        .once('listening', () => {
          tester.close(() => resolve(true));
        })
        .listen(port, host);
    });
    if (available) return port;
  }
  return 0; // deixa o SO escolher uma porta livre
}

async function getFreePort({ min = 8880, max = 8890, host = '127.0.0.1' } = {}) {
  // tenta no range; se não der, cai para porta aleatória
  const p = await findFreePortInRange(min, max, host);
  return p || 0;
}

// ====================== ESTADO DO BOT ======================
class estadoPar {
  constructor(simbolo) { 
    this.simbolo = simbolo;
    this.moedaBase = global.getMoedaBase(simbolo);
    
    this.metaDiaria = config.LUCRO_DIARIO_ALVO;
    this.lucroDia = 0;
    this.saldoInicialDia = 0;
    this.performanceStats = { winRate: 0, avgWin: 0, avgLoss: 0, expectancy: 0, sharpeRatio: 0 };
    this.inicioExecucao = new Date().toISOString();
    this.performanceDiaria = { metaAtingida: false, efficiencyRatio: 0, tradesValidos: 0 };
    this.alertaUrgenciaAtivo = false;
    this.historicoDesempenho = [];
    this.precoBTCInicialDia = 0;
    this.drawdownMaximoDia = 0;
    this.modoRecuperacao = false;
    this.benchmarkBTC = 0;
    this.benchmarkMercado = 0;
    this.benchmarkBots = {};
    this.liquidez = 0;
    this.metaHoraria = 0;
    this.progressoHorario = 0;
    this.lucroHorario = 0;
    this.horaAtual = Utils.calcularHoraAtual();
    this.ultimoPrecoSolicitado = 0;
    this.ultimoPrecoExecutado = 0;
    this.horariosPrioritarios = [8, 10, 14, 19];
    this.fatorPrioridade = 1.0;
    this.ultimoTurboForcado = null;
    this.consecutiveAPIFailures = 0;
    this.ultimoRateLimit = null;
    this.tradesConsecutivos = 0;
    this.turboExpira = 0;
    this.riskRewardRatio = 2.5;
    this.volumeAtual = 0;
    this.mediaVolume = 0;
    this.volume24h = 0;
    this.historicoPrecos = [];
    this.historicoVolumes = [];
    this.saldos = this.inicializarSaldos();

    // Garantias/fallbacks:
    if (this.saldos.USDT === undefined) {
      this.saldos.USDT = config.SIMULA ? (config.SALDO_INICIAL_USDT || 0) : 0;
    }
    if (this.saldos.BNB === undefined) {
      this.saldos.BNB = 0;
    }
    // Propriedades operacionais (serão resetadas)
    this.reset();
  }

  inicializarSaldos() {
   const saldos = {}; // Nome corrigido para plural

    // Sempre USDT
    saldos.USDT = config.SIMULA ? Number(config.SALDO_INICIAL_USDT) || 0 : 0;

    // Moeda base do par atual
    const base = this.moedaBase || this.simbolo.replace('USDT', '');
    saldos[base] = config.SIMULA ? Number(config[`SALDO_INICIAL_${base}`]) || 0 : 0;

    // Outras moedas dos pares ativos
    const ativos = (global.paresAtivos || config.PARES_ATIVOS || ['BTCUSDT'])
      .map(p => p.replace('USDT', ''));

    for (const mb of ativos) {
      if (!(mb in saldos)) {
        saldos[mb] = config.SIMULA ? Number(config[`SALDO_INICIAL_${mb}`]) || 0 : 0;
      }
    }

    // Garantir BNB se necessário
    if (saldos.BNB === undefined) saldos.BNB = 0;

    return saldos; // Retorna a variável correta
  }

    reset() {
        if (!this.saldos) {
           this.saldos = this.inicializarSaldos();
        }
        // Reset de saldos e estado operacional
        Object.keys(this.saldos).forEach(moedaBase => {
           this.saldos[moedaBase] = moedaBase === 'USDT'
           ? (config.SIMULA ? (config.SALDO_INICIAL_USDT || 0) : 0)
           : (config.SIMULA ? (config[`SALDO_INICIAL_${moedaBase}`] || 0) : 0);
        });
        // Reset de estado de trading
        this.precoInicial = 0;
        this.precoAtual = 0;
        this.precoRef = 0;
        this.historicoPrecos = [];
        this.historicoCompleto = [];
        this.historicoVolumes = [];
        this.ultimaCompra = null;
        this.ultimaCompraQtd = null;
        this.ultimaVenda = null;
        this.ultimaVendaQtd = null;
        this.lucroAcumulado = 0;
        this.stopLoss = null;
        this.takeProfit = null;
        
        // Reset de indicadores técnicos
        this.emaShort = 0;
        this.emaLong = 0;
        this.signalLine = 0;
        this.rsi = 50;
        this.macd = { macd: 0, signal: 0, histogram: 0 };
        this.atr = 0;
        this.volatilidade = 0;
        this.threshold = 0;
        this.drawdown = 0;
        this.tendencia = 'NEUTRA';
        
        // Reset de estado operacional
        this.tradesHoje = 0;
        this.emOperacao = false;
        this.quantidade = 0;
        this.precoEntrada = 0;
        this.stopMovel = null;
        this.ultimoUpdate = new Date();
        this.historico = [];
        
        // Reset de monitoramento
        this.ultimoErro = null;
        this.ultimaOperacao = null;
        this.ultimaOperacaoTimestamp = null;
        this.healthCheck = {
            ultimaConexao: new Date().toISOString(),
            totalErros: 0,
            totalTrades: 0,
            totalTaxas: 0,
            ordensRejeitadas: 0,
            ultimoErro: null
        };
        
        // Reset de métricas diárias
        this.lucroDia = 0;
        this.saldoInicialDia = 0;
        this.performanceDiaria = { metaAtingida: false, efficiencyRatio: 0, tradesValidos: 0 };
        this.alertaUrgenciaAtivo = false;
        this.precoBTCInicialDia = 0;
        this.drawdownMaximoDia = 0;
        this.modoRecuperacao = false;
        this.benchmarkBTC = 0;
        this.benchmarkMercado = 0;
        this.liquidez = 0;
        this.metaHoraria = 0;
        this.progressoHorario = 0;
        this.lucroHorario = 0;
        this.horaAtual = Utils.calcularHoraAtual();
        this.ultimoPrecoSolicitado = 0;
        this.ultimoPrecoExecutado = 0;
        this.ultimoTurboForcado = null;
        this.consecutiveAPIFailures = 0;
        this.ultimoRateLimit = null;
        this.tradesConsecutivos = 0;
        this.turboExpira = 0;
    }

    iniciarOperacao(quantidade, preco) {
        this.emOperacao = true;
        this.quantidade = quantidade;
        this.precoEntrada = preco;
        this.ultimoUpdate = new Date();
    }

    encerrarOperacao() {
        this.emOperacao = false;
        this.quantidade = 0;
        this.ultimoUpdate = new Date();
    }

    async salvarEstado() {
      try {
        const toSave = {
          precoRef: this.precoRef,
          ultimaCompra: this.ultimaCompra,
          ultimaCompraQtd: this.ultimaCompraQtd,
          ultimaVenda: this.ultimaVenda,
          ultimaVendaQtd: this.ultimaVendaQtd,
          lucroAcumulado: parseFloat(this.lucroAcumulado.toFixed(2)),
          tradesHoje: this.tradesHoje,
          emOperacao: this.emOperacao,
          capitalInicialTotal: this.capitalInicialTotal || undefined,
          healthCheck: { ...this.healthCheck },
          performanceStats: this.performanceStats,
          metaDiaria: this.metaDiaria,
          lucroDia: this.lucroDia,
          saldoInicialDia: this.saldoInicialDia,
          inicioExecucao: this.inicioExecucao,
          ultimaOperacao: this.ultimaOperacao,
          ultimaOperacaoTimestamp: this.ultimaOperacaoTimestamp,
          performanceDiaria: this.performanceDiaria,
          alertaUrgenciaAtivo: this.alertaUrgenciaAtivo,
          historicoDesempenho: this.historicoDesempenho,
          precoBTCInicialDia: this.precoBTCInicialDia,
          drawdownMaximoDia: this.drawdownMaximoDia,
          modoRecuperacao: this.modoRecuperacao,
          benchmarkBTC: this.benchmarkBTC,
          benchmarkMercado: this.benchmarkMercado,
          benchmarkBots: this.benchmarkBots,
          liquidez: this.liquidez,
          metaHoraria: this.metaHoraria,
          progressoHorario: this.progressoHorario,
          horariosPrioritarios: this.horariosPrioritarios,
          lucroHorario: this.lucroHorario,
          horaAtual: this.horaAtual,
          ultimoPrecoSolicitado: this.ultimoPrecoSolicitado,
          ultimoPrecoExecutado: this.ultimoPrecoExecutado,
          ultimoTurboForcado: this.ultimoTurboForcado,
          consecutiveAPIFailures: this.consecutiveAPIFailures,
          ultimoRateLimit: this.ultimoRateLimit,
          tradesConsecutivos: this.tradesConsecutivos,
          turboExpira: this.turboExpira,
          riskRewardRatio: this.riskRewardRatio,
          saldos: this.saldos || { USDT: 0 }
        };
        
        // 2. Garantir que o diretório existe
        const logsDir = path.join(__dirname, 'LOGS');
        await fs.mkdir(logsDir, { recursive: true });
      
        // 3. Salvar em arquivo
        const arquivo = path.join(logsDir, `estado_${this.simbolo}.json`);
        await fs.writeFile(arquivo, JSON.stringify(toSave, null, 2));

        // 3. Salvar em arquivo específico do par
        console.log(`[${this.simbolo}] Estado salvo em: ${arquivo}`);
      
        // Verificar se o arquivo foi criado
        const stats = await fs.stat(arquivo);
        console.log(`[${this.simbolo}] Tamanho do arquivo: ${stats.size} bytes`);

  //      console.log(`[${this.simbolo}] Estado salvo com sucesso`);
      } catch (error) {
        console.error(chalk.red(`[${this.simbolo}] Erro grave ao salvar estado: ${error.message}`));
      
        // Tentar salvar em diretório temporário como fallback
        const tempFile = path.join(os.tmpdir(), `estado_${this.simbolo}.json`);
        await fs.writeFile(tempFile, JSON.stringify(toSave, null, 2));
        console.error(chalk.yellow(`[${this.simbolo}] Estado salvo em local temporário: ${tempFile}`));
      }
    }

    async carregarEstadoSalvo() {
      const logsDir = path.join(__dirname, 'LOGS');
      const arquivo = path.join(logsDir, `estado_${this.simbolo}.json`);

      try {
        // Garantir que o diretório existe
        await fs.mkdir(logsDir, { recursive: true });
      
        // Verificar se o arquivo existe
        try {
            await fs.access(arquivo);
            const data = await fs.readFile(arquivo, 'utf8');
            const saved = JSON.parse(data);
            if (saved.saldos) {
                // Mescla saldos existentes com salvos
                this.saldos = {...this.saldos, ...saved.saldos};
            } else {
              this.saldos = this.inicializarSaldos(); 
            }   
            if (!saved.saldos) {
              console.warn(`[${this.simbolo}] Estado carregado sem saldos! Criando...`);
              saved.saldos = {
                USDT: config.SALDO_INICIAL_USDT || 0,
                [this.simbolo.replace('USDT', '')]: 0
              };
            }

            Object.assign(this, saved);
                  
            this.carregadoDoArquivo = true; // MARCAR COMO CARREGADO
            console.log(`[${this.simbolo}] Estado carregado com sucesso`);
            return 'carregado';
          } catch {
              console.log(`[${this.simbolo}] Arquivo de estado não encontrado. Criando novo.`);
              await this.salvarEstado();
                  
              this.carregadoDoArquivo = false; // MARCAR COMO NOVO
              return 'novo';
          }
      } catch (err) {
          console.error(`[${this.simbolo}] ERRO ao carregar estado: ${err.message}`);
          
          // Fallback: criar novo estado
          this.reset();
          await this.salvarEstado();
          
          this.carregadoDoArquivo = false; // MARCAR COMO RECRIADO
          return 'recriado';
      }
    }

      // Método auxiliar para adicionar nova moeda
    adicionarMoeda(moedaBase, saldoInicial = 0) {
      // Garantir que o objeto saldos existe
      if (!this.saldos) {
        this.saldos = {};
      }
    
      // Adicionar moeda apenas se ainda não existir
      if (moedaBase && !this.saldos[moedaBase]) {
        this.saldos[moedaBase] = config.SIMULA ? Number(saldoInicial) : 0;
      }
    }
  
    // Método para atualizar saldo
    atualizarSaldo(moedaBase, valor) {
      // Validação rigorosa
      if (typeof moedaBase !== 'string' || moedaBase.trim() === '') {
        console.error('Moeda base inválida:', moedaBase);
        return;
      }
    
      if (typeof valor !== 'number' || isNaN(valor)) {
        console.error('Valor inválido:', valor);
        return;
      }
    
      // Garantir estrutura
      if (!this.saldos) {
        this.saldos = {};
        console.warn('Objeto saldos foi criado automaticamente');
      }
    
      // Adicionar moeda se necessário
      if (this.saldos[moedaBase] === undefined) {
        this.adicionarMoeda(moedaBase, 0);
        console.log(`Moeda ${moedaBase} adicionada ao saldo`);
      }
    
      // Atualizar com histórico
      const valorAnterior = this.saldos[moedaBase];
      this.saldos[moedaBase] = Number(valor.toFixed(8)); // Precisão de criptomoedas
    
      // Log para auditoria
      if (Math.abs(valorAnterior - valor) > valorAnterior * 0.05) {
        console.log(`Saldo ${moedaBase} alterado: ${valorAnterior} → ${valor}`);
      }
    }
}

    // Função global para salvar o estado de um par
    async function salvarEstado(par, estado) {
      try {
        // 1. Se o objeto estado tiver método salvarEstado (da classe), usa ele
        if (typeof estado?.salvarEstado === 'function') {
          await estado.salvarEstado();
          return;
        }

        // 2. Caso contrário, salva manualmente (fallback)
        const toSave = {
          ...estado,
          simbolo: par,
          atualizadoEm: new Date().toISOString(),
        };

        const logsDir = path.join(__dirname, 'LOGS');
        await fs.mkdir(logsDir, { recursive: true });

        const arquivo = path.join(logsDir, `estado_${par}.json`);
        await fs.writeFile(arquivo, JSON.stringify(toSave, null, 2));

        console.log(`[${par}] Estado salvo em fallback: ${arquivo}`);
      } catch (err) {
        console.error(`[${par}] Erro ao salvar estado: ${err.message}`);
      }
    }


// ====================== LOGGER ======================
class Logger {
  constructor() {
    this.logFile = null;
    this.csvFile = null;
    this.statsFile = null;
    this.historicoFile = null;
    this.iniciado = false;
    this.erroInicial = false;
  }

  async inicializar() {
    try {
      // 1. Criar diretório de logs
      const logsDir = path.join(__dirname, 'LOGS');

      try {
        await fs.access(logsDir);
      } catch {
        await fs.mkdir(logsDir, { recursive: true });
      }
     
      // 2. Gerar timestamp formatado
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
      
      // 3. Definir caminhos dos arquivos
      this.logFile = path.join(logsDir, `log_${timestamp}.log`);
      this.csvFile = path.join(logsDir, `trades_${timestamp}.csv`);
      this.statsFile = path.join(logsDir, `stats_${timestamp}.json`);
      this.historicoFile = path.join(logsDir, 'historico_desempenho.json');
      
      // 4. Criar arquivos iniciais
      await fs.writeFile(this.logFile, `[${timestamp}] [INFO] Logger iniciado\n`);
      await fs.writeFile(this.csvFile, 'timestamp,tipo,preco,quantidade,taxa,rsi,emaShort,emaLong,macd,signal,histogram,atr,vol,th,dd\n');

      // 5. Inicializar arquivo de estatísticas
      await this.salvarStats();

      // 6. Verificar e criar histórico se necessário
      try {
        await fs.access(this.historicoFile);
      } catch {
        await fs.writeFile(this.historicoFile, '[]');
      }
      
      // 7. Marcar como iniciado com sucesso
      this.iniciado = true;
      console.log(chalk.green('✅ Logger iniciado com sucesso'));
      return true;
    } catch (err) {
      this.erroInicial = true;
      console.error(chalk.red('❌ Erro crítico ao iniciar logs:'), err);
      
      try {
        // 8. Fallback para diretório temporário
        const tmpDir = os.tmpdir();
        const timestamp = Date.now();
        
        this.logFile = path.join(tmpDir, `bot_log_${timestamp}.log`);
        this.csvFile = path.join(tmpDir, `bot_trades_${timestamp}.csv`);
        this.statsFile = path.join(tmpDir, `bot_stats_${timestamp}.json`);
        this.historicoFile = path.join(tmpDir, 'bot_historico.json');
        
        await fs.writeFile(this.logFile, `[${new Date().toISOString()}] [ALERTA] Usando logs temporários\n`);
        await fs.writeFile(this.csvFile, 'timestamp,tipo,preco,quantidade\n');
        await fs.writeFile(this.statsFile, JSON.stringify({ alerta: 'Modo temporário ativado' }));
        await fs.writeFile(this.historicoFile, '[]');
        
        this.iniciado = true;
        console.log(chalk.yellow(`⚠️ Usando arquivos temporários em: ${tmpDir}`));
        return true;
      } catch (fallbackErr) {
        console.error(chalk.red('❌ Falha catastrófica no fallback de logs:'), fallbackErr);
        this.iniciado = false;
        return false;
      }
    }
  }

    async log(msg, tipo = 'INFO', estadoPar = null) {
      // 1. Verificar se o logger foi inicializado
      if (!this.iniciado && !this.erroInicial) {
        console.log(chalk.yellow(`[⚠️ LOG NÃO INICIADO] [${tipo}] ${msg}`));
        return;
      }
      
      // 2. Formatar mensagem
      const timestamp = new Date();
      const dataFormatada = timestamp.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      const linha = `[${dataFormatada}] [${tipo}] ${msg}\n`;
      
      try {
        // 3. Escrever no arquivo de log
        if (this.logFile) {
          await fs.appendFile(this.logFile, linha);
        }
        
        // 4. Exibir no console com cores
        let mostrarTodosLogs = '';
        const tiposParaConsole = ['ERRO', 'ALERTA', 'TRADE', 'PASSO']; 
        mostrarTodosLogs = process.env.NODE_ENV === 'development';

        if (mostrarTodosLogs || tiposParaConsole.includes(tipo)) {
          const cores = {
            ERRO: chalk.red,
            AVISO: chalk.yellow,
            TRADE: chalk.cyan,
            ALERTA: chalk.bgRed.white,
            DEBUG: chalk.gray,
            INFO: chalk.white,
            PASSO: chalk.bgYellow.black
          };
          
          const cor = cores[tipo] || chalk.white;
          console.log(cor(linha.trim()));
        }

        // 5. Atualizar estadoPar se for erro
        if (tipo === 'ERRO' && estadoPar) {
          estadoPar.ultimoErro = { timestamp: dataFormatada, msg };
          if (estadoPar.healthCheck) {
            estadoPar.healthCheck.totalErros++;
          }
        }
      } catch (err) {
        console.error(chalk.red('❌ Erro ao escrever no log:'), err);
      }
    }


    async logCSV(tipo, preco, qtd, taxa, rsi, emaShort, emaLong, macd, atr, vol, th, dd, estadoPar) {
      // 1. Verificar se o logger está pronto
      console.log('[DEBUG] logCSV() chamado - iniciado:', this.iniciado);

      if (!this.iniciado || !this.csvFile) {
        console.log('[⚠️] Logger NÃO iniciado. Abortando logCSV.');
        return;
      }

      try {
        // 2. Formatar linha CSV
        const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        const linha = [
          timestamp,
          tipo,
          preco?.toFixed(2) || '0.00',
          qtd?.toFixed(6) || '0.000000',
          taxa?.toFixed(4) || '0.0000',
          rsi?.toFixed(2) || '0.00',
          emaShort?.toFixed(2) || '0.00',
          emaLong?.toFixed(2) || '0.00',
          macd?.macd?.toFixed(2) || '0.00',
          macd?.signal?.toFixed(2) || '0.00',
          macd?.histogram?.toFixed(2) || '0.00',
          atr?.toFixed(2) || '0.00',
          vol ? (vol * 100).toFixed(2) : '0.00',
          th ? (th * 100).toFixed(2) : '0.00',
          dd ? (dd * 100).toFixed(2) : '0.00',
          estadoPar?.moedaBase || 'UNK'
        ].join(',') + '\n';
        
        // 3. Escrever no arquivo CSV
        await fs.appendFile(this.csvFile, linha);
        console.log('[✅] Linha gravada no CSV.');
        
        // 4. Atualizar estatísticas
        if (estadoPar && estadoPar.healthCheck) {
          estadoPar.healthCheck.totalTrades++;
        }
      } catch (err) {
        await this.log(`Erro ao gravar no CSV: ${err.message}`, 'ERRO');
      }
    }

    async salvarStats(simbolo, estadoPar) {
      if (!this.iniciado || !estadoPar) return;

      try {
        const statsFile = path.join(__dirname, 'LOGS', `stats_${simbolo}.json`);
        const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
        const saldoCrypto = estadoPar.saldos?.[moedaBase] || 0;
        let valorTotal = (estadoPar.saldos?.USDT || 0) + 
                      (saldoCrypto * (estadoPar.precoAtual || 0));

        const precosCache = {};
        
        for (const [moedaBase, saldo] of Object.entries(estadoPar.saldos)) {
          if (moedaBase === 'USDT') {
              valorTotal += saldo;
            } else { 
                try {
                    // Obter preço apenas se não tiver em cache
                    if (!precosCache[moedaBase]) {
                        const par = `${moedaBase}USDT`;
                        const { price } = await ConexaoAPI.obterPrecoAtual(par); 
                        precosCache[moedaBase] = Number(price);
                    }

                    // garantir número
                    if (!isNaN(precosCache[moedaBase])) {
                        valorTotal += saldo * precosCache[moedaBase];
                    } else {
                        await this.log(`[${simbolo}] Preço inválido em salvarStats para ${moedaBase}`, "ERRO");
                        valorTotal += saldo * (estadoPar.precoAtual || 0);
                    }
                } catch {
                    // Usar último preço conhecido como fallback
                    valorTotal += saldo * (estadoPar.precoAtual || 0);
                }
            }
        }
        const stats = {
          timestamp: new Date().toISOString(),
          saldoUSDT: estadoPar.saldos.USDT || 0,
          saldoCrypto: saldoCrypto,
          moedaBase: moedaBase,
          lucroAcumulado: estadoPar.lucroAcumulado || 0,
          tradesHoje: estadoPar.tradesHoje || 0,
          drawdownAtual: estadoPar.precoAtual ?
            ((estadoPar.precoRef - estadoPar.precoAtual) / estadoPar.precoRef * 100).toFixed(2) : 0,
          healthCheck: estadoPar.healthCheck ? { ...estadoPar.healthCheck } : {},
          totalTaxas: estadoPar.healthCheck?.totalTaxas?.toFixed(2) || '0.00',
          lucroLiquido: (estadoPar.lucroAcumulado - (estadoPar.healthCheck?.totalTaxas || 0)).toFixed(2),
          performanceStats: estadoPar.performanceStats ? { ...estadoPar.performanceStats } : {},
          metaDiaria: estadoPar.metaDiaria || 0,
          lucroDia: estadoPar.lucroDia || 0,
          saldoInicialDia: estadoPar.saldoInicialDia || 0,
          inicioExecucao: estadoPar.inicioExecucao || new Date().toISOString(),
          performanceDiaria: estadoPar.performanceDiaria ? { ...estadoPar.performanceDiaria } : {},
          precoBTCInicialDia: estadoPar.precoBTCInicialDia || 0,
          drawdownMaximoDia: estadoPar.drawdownMaximoDia || 0,
          modoRecuperacao: estadoPar.modoRecuperacao || false,
          benchmarkBTC: estadoPar.benchmarkBTC || 0,
          benchmarkMercado: estadoPar.benchmarkMercado || 0,
          liquidez: estadoPar.liquidez || 0,
          metaHoraria: estadoPar.metaHoraria || 0,
          progressoHorario: estadoPar.progressoHorario || 0,
          lucroHorario: estadoPar.lucroHorario || 0,
          horaAtual: estadoPar.horaAtual || new Date().getHours(),
          ultimoPrecoSolicitado: estadoPar.ultimoPrecoSolicitado || 0,
          ultimoPrecoExecutado: estadoPar.ultimoPrecoExecutado || 0
        };

        await fs.writeFile(statsFile, JSON.stringify(stats, null, 2));

      } catch (err) {
        await this.log(`Erro ao salvar estatísticas [${simbolo}]: ${err.message}`, 'ERRO');
      }
    }

    async salvarHistoricoDesempenho(simbolo, estadoPar) {
      if (!this.iniciado || !estadoPar) return;

      try {
        const historicoFile = path.join(__dirname, 'LOGS', `historico_${simbolo}.json`);
        const hoje = new Date().toISOString().split('T')[0];

        const entry = {
          data: hoje,
          saldoInicial: estadoPar.saldoInicialDia || 0,
          saldoFinal: estadoPar.saldos.USDT + (estadoPar.saldos.BTC * (estadoPar.precoAtual || 0)),
          lucroDia: estadoPar.lucroDia || 0,
          trades: estadoPar.tradesHoje || 0,
          winRate: estadoPar.performanceDiaria?.tradesValidos / Math.max(1, estadoPar.tradesHoje) || 0,
          drawdownMaximo: estadoPar.drawdownMaximoDia || 0,
          taxas: estadoPar.healthCheck?.totalTaxas || 0,
          benchmarkBTC: estadoPar.benchmarkBTC || 0,
          benchmarkMercado: estadoPar.benchmarkMercado || 0,
          liquidez: estadoPar.liquidez || 0,
          metaHoraria: estadoPar.metaHoraria || 0,
          progressoHorario: estadoPar.progressoHorario || 0,
          slippage: estadoPar.ultimoPrecoSolicitado && estadoPar.ultimoPrecoExecutado ?
            ((estadoPar.ultimoPrecoExecutado - estadoPar.ultimoPrecoSolicitado) / estadoPar.ultimoPrecoSolicitado * 100).toFixed(4) : 0
        };

        let historicoCompleto = [];
        try {
          const data = await fs.readFile(historicoFile, 'utf8');
          historicoCompleto = JSON.parse(data);
          if (!Array.isArray(historicoCompleto)) {
            throw new Error('Formato inválido de histórico');
          }
        } catch (readErr) {
          await this.log(`Recriando histórico para ${simbolo}: ${readErr.message}`, 'AVISO');
          historicoCompleto = [];
        }

        const indexExistente = historicoCompleto.findIndex(e => e.data === hoje);
        if (indexExistente >= 0) {
          historicoCompleto[indexExistente] = entry;
        } else {
          historicoCompleto.push(entry);
        }

        if (historicoCompleto.length > 365) {
          historicoCompleto = historicoCompleto.slice(-365);
        }

        await fs.writeFile(historicoFile, JSON.stringify(historicoCompleto, null, 2));

      } catch (err) {
        await this.log(`Erro ao salvar histórico [${simbolo}]: ${err.message}`, 'ERRO');
      }
    }
}
const logger = new Logger();
global.logger = logger;

// ====================== GERENCIADOR DE ESTADOS ======================
class Estado {
    static estados = {};

    static obterEstadoPar(simbolo) {
        return this.estados[simbolo] || null;
    }

    static registrarEstado(simbolo, estado) {
        this.estados[simbolo] = estado;
        console.log(`[Estado] Registrado estado para ${simbolo}`);
    }
}

// ====================== INDICADORES ======================
class Indicadores {
  static calcEMA(currentPrice, period, prevEMA) {
    if (prevEMA === null || prevEMA === undefined) {
      return currentPrice;
    }
    const k = 2 / (period + 1);
    return (currentPrice * k) + (prevEMA * (1 - k));
  }

  static calcRSI(precos, period = estrategia.RSI_PERIOD) {
    if (!precos || precos.length < period + 1) return 50;

    const validPrices = precos.filter(p => p > 0 && !isNaN(p));
    if (validPrices.length < period + 1) return 50;
    
    const relevant = precos.slice(-(period + 1));
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < relevant.length; i++) {
      const diff = relevant[i] - relevant[i - 1];
      diff >= 0 ? gains += diff : losses -= diff;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static updateMACD(estado) {
    if (typeof estado.emaShort !== 'number' || 
      typeof estado.emaLong !== 'number' ||
      isNaN(estado.emaShort) || 
      isNaN(estado.emaLong) ||
      estado.emaShort <= 0 ||
      estado.emaLong <= 0) {
        estado.emaShort = estado.precoAtual;
        estado.emaLong = estado.precoAtual;
        estado.signalLine = estado.precoAtual * 0.1;
        estado.macd = { macd: 0, signal: 0, histogram: 0 };
        return;
    }
    
    if (estado.emaShort === 0 || estado.emaLong === 0 || 
        isNaN(estado.emaShort) || isNaN(estado.emaLong)) {
      estado.emaShort = estado.precoAtual;
      estado.emaLong = estado.precoAtual;
      estado.signalLine = 0;
      estado.macd = { macd: 0, signal: 0, histogram: 0 };
      return;
    }
    
    const diferenca = Math.abs(estado.emaShort - estado.emaLong);
    if (diferenca > 0 && estado.signalLine > diferenca * 5) {
      estado.signalLine = 0;
    }

    estado.emaShort = this.calcEMA(
      estado.precoAtual,
      estrategia.EMA_SHORT_PERIOD,
      estado.emaShort
    );
    
    estado.emaLong = this.calcEMA(
      estado.precoAtual,
      estrategia.EMA_LONG_PERIOD,
      estado.emaLong
    );
    
    const macdLine = estado.emaShort - estado.emaLong;
    
    if (estado.signalLine === null || estado.signalLine === undefined) {
      estado.signalLine = macdLine;
    } else {
      estado.signalLine = this.calcEMA(
        macdLine,
        estrategia.MACD_SIGNAL,
        estado.signalLine
      );
    }
    
    estado.macd = {
      macd: macdLine,
      signal: estado.signalLine,
      histogram: macdLine - estado.signalLine
    };
  }

  static calcSMA(values, period) {
    if (!values || values.length < period) return 0;
    const sum = values.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  static calcATR(precos) {
    const period = estrategia.ATR_PERIOD;
    if (!precos || precos.length < period + 1) return precos.length > 0 ? Math.abs(precos[precos.length-1] - precos[0]) : 0;
    const trueRanges = [];
    for (let i = 1; i < precos.length; i++) {
      const tr = Math.max(
        Math.abs(precos[i] - precos[i - 1]),
        Math.abs(precos[i] - (i > 1 ? precos[i - 2] : precos[i - 1])),
        Math.abs(precos[i - 1] - (i > 1 ? precos[i - 2] : precos[i]))
      );
      trueRanges.push(tr);
    }
    return this.calcSMA(trueRanges.slice(-period), period);
  }

  static calcVolatilidade(precos) {
    if (!precos || precos.length < 2) return 0;
    const media = precos.reduce((a, b) => a + b, 0) / precos.length;
    const variancia = precos.reduce((s, p) => s + (p - media) ** 2, 0) / precos.length;
    return Math.sqrt(variancia) / media;
  }

  static determinarTendencia(emaShort, emaLong, macd) {
    if (emaShort > emaLong && macd.histogram > 0) return 'ALTA';
    if (emaShort < emaLong && macd.histogram < 0) return 'BAIXA';
    return 'NEUTRA';
  }

  static volumeAnormal(volumes) {
    if (!volumes || volumes.length < 10) return false;
    const avg = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const current = volumes[volumes.length - 1];
    return current > avg * 1.8;
  }

  static deveComprar(estado) {
    const rsiOversold = estado.rsi < 30;
    const padraoFundo = (
      estado.historicoPrecos.length >= 3 &&
      estado.historicoPrecos[estado.historicoPrecos.length-1] > estado.historicoPrecos[estado.historicoPrecos.length-2] &&
      estado.historicoPrecos[estado.historicoPrecos.length-2] < estado.historicoPrecos[estado.historicoPrecos.length-3]
    );
    
    const ultimosPrecos = estado.historicoPrecos.slice(-3);
    const padraoMartelo = (
      ultimosPrecos.length === 3 &&
      ultimosPrecos[2] > ultimosPrecos[1] && 
      (ultimosPrecos[0] - ultimosPrecos[1]) / (ultimosPrecos[2] - ultimosPrecos[1]) > 0.7
    );
    
    const padraoEngolfo = (
      ultimosPrecos.length === 3 &&
      ultimosPrecos[0] > ultimosPrecos[2] && 
      ultimosPrecos[1] < ultimosPrecos[2] &&
      (ultimosPrecos[0] - ultimosPrecos[1]) > (ultimosPrecos[2] - ultimosPrecos[1])
    );
    
    const condicoesBasicas = (
      estado.rsi < estrategia.RSI_COMPRA_MAX &&
      estado.emaLong > 0 &&
      (estado.emaShort - estado.emaLong) / estado.emaLong > 0.002 &&
      estado.volatilidade > 0.001
    );
    
    const condicoesAgresivas = (
      (estado.macd?.histogram > 0 && estado.macd?.macd > estado.macd?.signal) ||
      padraoMartelo ||
      padraoEngolfo ||
      (rsiOversold && padraoFundo)
    );
    
    return (condicoesBasicas || condicoesAgresivas) && 
           estado.tradesHoje < config.MAX_TRADES_DIA &&
           !estado.emOperacao;
  }
  
  static deveVender(estado) {
     const precoAtual = estado.precoAtual;
     const precoCompra = estado.precoCompra;
     const lucroMinimo = estrategia.LUCRO_MINIMO || 1.03;
     const stopLoss = estrategia.STOP_LOSS || 0.985;

     if (!precoAtual || !precoCompra) return false;

     return (
       precoAtual >= precoCompra * lucroMinimo || // take-profit
       precoAtual <= precoCompra * stopLoss       // stop-loss
     );
  }
}

// ====================== IA DE TRADING ======================
class TradingAI {
  constructor() {
    this.net = new brain.NeuralNetwork();
    this.treinada = false;
    this.trainingInProgress = false;
    this.ultimoSaveTreino = 0;
    this.ultimoTreino = 0;
    this.dadosTreino = [];
    this.historicoPorPar = {};

    if (config.USE_AI) {
      this.trainingInProgress = true;
      this.trainModel().then(() => {
        this.treinada = true;
        this.trainingInProgress = false;
        global.logger.log("Modelo de IA treinado com sucesso", "INFO");
      }).catch(err => {
        global.logger.log(`Erro ao treinar modelo de IA: ${err.message}`, "ERRO");
        this.trainingInProgress = false;
        // Fornecer dados simulados como fallback
        this.forcarDadosSimulados();
      });
    }
  }

  // Método para forçar dados simulados em caso de falha
  forcarDadosSimulados() {
    try {
      const dadosSimulados = [ 
        { input: { rsi: 0.3, emaDiff: 0.01, volumeChange: 1.5, priceChange: 0.01 }, output: { buySignal: 1, sellSignal: 0 } },
        { input: { rsi: 0.7, emaDiff: -0.02, volumeChange: 0.8, priceChange: -0.01 }, output: { buySignal: 0, sellSignal: 1 } },
        { input: { rsi: 0.5, emaDiff: 0.001, volumeChange: 1.1, priceChange: 0.002 }, output: { buySignal: 0, sellSignal: 0 } }
      ];
      
      this.net.train(dadosSimulados, {
        iterations: 50,
        errorThresh: 0.01,
        log: true,
        logPeriod: 10
      });
      
      this.treinada = true;
      global.logger.log("Usando dados simulados para IA", "AVISO");
    } catch (simErr) {
      global.logger.log(`Falha ao usar dados simulados: ${simErr.message}`, "ERRO");
    }
  }

  async trainModel() {
    try {
      const trainingData = await this.loadTrainingData();
      
      // Verificação adicional de dados
      if (!trainingData || trainingData.length === 0) {
        throw new Error("Dados de treinamento vazios - usando fallback");
      }
      
      // Verifica a estrutura dos dados
      const isValid = trainingData.every(item => 
        item.input && item.output && 
        typeof item.input === 'object' && 
        typeof item.output === 'object'
      );
      
      if (!isValid) {
        throw new Error("Formato inválido de dados de treinamento");
      }

      this.net.train(trainingData, {
        iterations: 200,
        errorThresh: 0.005,
        log: true,
        logPeriod: 50,
        learningRate: 0.3
      });
      return true;
    } catch (err) {
      // Tentar fallback com dados simulados
      this.forcarDadosSimulados();
      return false;
    }
  }

  async loadTrainingData() {
    try {
      const dataPath = path.join(__dirname, 'LOGS', 'training_data.json');
      
      // Verificar se o diretório existe
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      
      // Verificar se o arquivo existe
      let fileExists = true;
      try {
        await fs.access(dataPath);
      } catch {
        fileExists = false;
      }
      
      if (!fileExists) {
        await fs.writeFile(dataPath, JSON.stringify([]));
        global.logger.log("Arquivo de treino criado", "INFO");
        return [];
      }
      
      const rawData = await fs.readFile(dataPath, 'utf8');
      return JSON.parse(rawData);
    } catch (err) {
      await global.logger.log(`Usando dados simulados: ${err.message}`, "AVISO");
      return [ 
        { input: { rsi: 0.3, emaDiff: 0.01, volumeChange: 1.5, priceChange: 0.01 }, output: { buySignal: 1, sellSignal: 0 } },
        { input: { rsi: 0.7, emaDiff: -0.02, volumeChange: 0.8, priceChange: -0.01 }, output: { buySignal: 0, sellSignal: 1 } },
        { input: { rsi: 0.5, emaDiff: 0.001, volumeChange: 1.1, priceChange: 0.002 }, output: { buySignal: 0, sellSignal: 0 } },
        { input: { rsi: 0.25, emaDiff: -0.015, volumeChange: 2.2, priceChange: -0.02 }, output: { buySignal: 1, sellSignal: 0 } },
        { input: { rsi: 0.42, emaDiff: 0.005, volumeChange: 1.3, priceChange: 0.005 }, output: { buySignal: 1, sellSignal: 0 } },
        { input: { rsi: 0.68, emaDiff: 0.018, volumeChange: 0.9, priceChange: 0.012 }, output: { buySignal: 0, sellSignal: 1 } },
        { input: { rsi: 0.35, emaDiff: -0.008, volumeChange: 1.8, priceChange: -0.008 }, output: { buySignal: 1, sellSignal: 0 } },
        { input: { rsi: 0.55, emaDiff: 0.003, volumeChange: 1.2, priceChange: 0.004 }, output: { buySignal: 0, sellSignal: 0 } },
        { input: { rsi: 0.78, emaDiff: 0.022, volumeChange: 0.6, priceChange: 0.018 }, output: { buySignal: 0, sellSignal: 1 } }
      ];
    }
  }

  // Tomada de decisão mais agressiva
  makeDecision(estadoPar) {
    if (!estadoPar || typeof estadoPar !== 'object') {
        return null;
    }

    if (!config.USE_AI || !this.treinada || this.trainingInProgress || !estadoPar) {
      return null;
    }

    const safeEstado = {
        volumeAtual: estadoPar.volumeAtual || 0,
        mediaVolume: estadoPar.mediaVolume || 0,
        volume24h: estadoPar.volume24h || 0,
        precoAtual: estadoPar.precoAtual || 0,
        rsi: estadoPar.rsi || 50,
        emaShort: estadoPar.emaShort || 0,
        emaLong: estadoPar.emaLong || 0,
        simbolo: estadoPar.simbolo || 'UNKNOWN'
    };

    try {
      // 1. Garanta que todos os valores existam
      const rsi = estadoPar.rsi || 50;
      const macdHist = estadoPar.macd?.histograma || 0;
      const tendencia = estadoPar.tendencia || 'neutra';
      const precoAtual = estadoPar.precoAtual || 0;
      const emaShort = estadoPar.emaShort || precoAtual;  // Fallback para preço atual
      const emaLong = estadoPar.emaLong || precoAtual;    // Fallback para preço atual
      const emaDiff = (emaShort - emaLong) / (emaLong || 1);

      // 2. Defina explicitamente as variáveis
      let buySignal = rsi < 30 && macdHist > 0 && tendencia === 'alta';
      let sellSignal = rsi > 70 || macdHist < 0;

      // Inicializar histórico para o par se não existir
      if (!this.historicoPorPar[estadoPar.simbolo]) {
        this.historicoPorPar[estadoPar.simbolo] = {
          historicoPrecos: [],
          historicoVolumes: [],
          volumeAtual: 0
        };
      }
      
      const historicoPar = this.historicoPorPar[estadoPar.simbolo];

      let priceChange = 0;
      if (historicoPar.historicoPrecos.length > 1) {
        const lastPrice = historicoPar.historicoPrecos[historicoPar.historicoPrecos.length - 1];
        priceChange = lastPrice ? (precoAtual - lastPrice) / (lastPrice || 1) : 0;
      }
      
      let volumeChange = 0;
      if (historicoPar.historicoVolumes.length > 1) {
        const lastVolume = historicoPar.historicoVolumes[historicoPar.historicoVolumes.length - 1];
        volumeChange = lastVolume ? (historicoPar.volumeAtual - lastVolume) / (lastVolume || 1) : 0;
      }
      
      const input = {
        rsi: Math.max(0, Math.min(1, rsi / 100)),
        emaDiff: Math.max(-1, Math.min(1, emaDiff)),
        volumeChange: Math.max(-2, Math.min(5, volumeChange)),
        priceChange: Math.max(-0.2, Math.min(0.2, priceChange))
      };
      
      const output = this.net.run(input);
      
      // Limiares mais baixos para decisões agressivas
      const buyThreshold = 0.50; // Reduzido de 0.65
      const sellThreshold = 0.52; // Reduzido de 0.65

      buySignal = output.buySignal > buyThreshold;
      sellSignal = output.sellSignal > sellThreshold;

      let suggestedAmount = 0;
      let stopLoss = 0;
      let takeProfit = 0;
      
      // Fator de agressividade baseado no progresso da meta
      const progressoFaltante = 1 - (estadoPar.progressoHorario || 0);
      const fatorAgressividade = 1 + (progressoFaltante * 3);
      const saldoUSDT = (estadoPar.saldos && estadoPar.saldos?.USDT) || 0;    

      if (buySignal && saldoUSDT > 10) {
          // Aumentar a quantidade sugerida
          suggestedAmount = saldoUSDT * 0.35 * fatorAgressividade; //Aumentado de 0.25 para 0.35
          
          const valorOperacao = suggestedAmount * precoAtual;
          const taxaEstimada = valorOperacao * config.TAXA_TAKER;
          const custoTotal = valorOperacao + taxaEstimada;

          // Verifica se há saldo suficiente (incluindo taxas)
          if (saldoUSDT >= custoTotal) {
               stopLoss = precoAtual * (1 - (0.025 * fatorAgressividade));
               takeProfit = precoAtual * (1 + (0.006 * fatorAgressividade));
          } else {
            // Ajusta a operação para o saldo disponível
               suggestedAmount = (saldoUSDT - taxaEstimada) / precoAtual;
            
               // Log de ajuste
               global.logger.log(
                   `[${estadoPar.simbolo}] Ajustando operação por saldo insuficiente | ` +
                   `Original: ${valorOperacao.toFixed(2)} | ` +
                   `Disponível: ${saldoUSDT.toFixed(2)} | ` +
                   `Taxas: ${taxaEstimada.toFixed(2)}`,
                   "AVISO"
               );
            
               // Recalcula proteções com novo valor
               stopLoss = precoAtual * (1 - (0.025 * fatorAgressividade));
               takeProfit = precoAtual * (1 + (0.006 * fatorAgressividade));
          }
      }
      
      return {
        action: buySignal ? 'BUY' : sellSignal ? 'SELL' : 'HOLD',
        confidence: {
          buy: output.buySignal,
          sell: output.sellSignal
        },
        suggestedAmount,
        stopLoss,
        takeProfit,
        indicators: {
          rsi,
          emaDiff,
          volumeChange,
          priceChange
        }
      };
      
    } catch (err) {
      global.logger.log(`[${estadoPar.simbolo}] Erro na decisão da IA: ${err.message}`, "ERRO");
      // Retornar objeto padrão em caso de erro
      return {
         action: 'HOLD',
         confidence: { buy: 0, sell: 0 },
         suggestedAmount: 0,
         stopLoss: 0,
         takeProfit: 0,
         indicators: {}
      };
    }
  }

  async coletarDados(estadoPar) {
    if (!estadoPar) return;
    
    try {
      // Inicializar histórico para o par se não existir
      if (!this.historicoPorPar[estadoPar.simbolo]) {
        this.historicoPorPar[estadoPar.simbolo] = {
          historicoPrecos: [],
          historicoVolumes: [],
          volumeAtual: 0
        };
      }
   
      const historicoPar = this.historicoPorPar[estadoPar.simbolo];
      
      historicoPar.historicoPrecos.push(estadoPar.precoAtual);
      historicoPar.historicoVolumes.push(estadoPar.volume24h);
      historicoPar.volumeAtual = estadoPar.volume24h;
      
      // Limitar histórico
      if (historicoPar.historicoPrecos.length > 1000) {
        historicoPar.historicoPrecos.shift();
      }
      if (historicoPar.historicoVolumes.length > 1000) {
        historicoPar.historicoVolumes.shift();
      }
      
      // Salvar dados periodicamente
      if (Date.now() - this.ultimoSaveTreino > 3600000) {
        await this.salvarDadosTreinamento(estadoPar);
        this.ultimoSaveTreino = Date.now();
      }
      
      // Retreinar se necessário
      await this.retreinarModeloPeriodicamente();
      
    } catch (err) {
      global.logger.log(`[${estadoPar.simbolo}] Erro na coleta de dados: ${err.message}`, "ERRO");
    }
  }

  async salvarDadosTreinamento(estadoPar) {
    if (!estadoPar) return;
    
    try {
      const filePath = path.join(__dirname, 'LOGS', 'training_data.json');
      let dados = [];
      
      try {
        const dadosExistentes = await fs.readFile(filePath, 'utf8');
        dados = JSON.parse(dadosExistentes);
      } catch (e) {
        dados = [];
      }
      
      const novoPonto = {
        simbolo: estadoPar.simbolo, // Adicionado símbolo do par
        timestamp: Date.now(),
        preco: estadoPar.precoAtual,
        volume: estadoPar.volume24h,
        rsi: estadoPar.rsi,
        ema9: estadoPar.emaShort,
        ema21: estadoPar.emaLong,
        volumeChange: 0,
        priceChange: 0,
        action: 'HOLD'
      };
      
      if (dados.length > 0) {
        const ultimoPonto = dados[dados.length - 1];
        novoPonto.priceChange = (estadoPar.precoAtual - ultimoPonto.preco) / (ultimoPonto.preco || 1);
        novoPonto.volumeChange = (estadoPar.volume24h - ultimoPonto.volume) / (ultimoPonto.volume || 1);
        
        const priceDiff = (estadoPar.precoAtual - ultimoPonto.preco) / ultimoPonto.preco;
        if (priceDiff > 0.005) {
          ultimoPonto.action = 'BUY';
        } else if (priceDiff < -0.005) {
          ultimoPonto.action = 'SELL';
        }
      }
      
      this.dadosTreino.push(novoPonto);
      
      if (this.dadosTreino.length >= 100 || (Date.now() - this.ultimoSaveTreino) > 3600000) {
        dados = [...dados, ...this.dadosTreino];
        this.dadosTreino = [];
        
        if (dados.length > 5000) {
          dados = dados.slice(-5000);
        }
        
        await fs.writeFile(filePath, JSON.stringify(dados, null, 2));
        this.ultimoSaveTreino = Date.now();
      }
      
    } catch (err) {
      global.logger.log(`[${estadoPar.simbolo}] Erro ao salvar dados de treinamento: ${err.message}`, "ERRO");
    }
  }

  async retreinarModeloPeriodicamente() {
    if (Date.now() - this.ultimoTreino > 86400000) {
      try {
        global.logger.log("Iniciando retreinamento do modelo de IA...", "INFO");
        this.trainingInProgress = true;
        const success = await this.trainModel();
        if (success) {
          this.ultimoTreino = Date.now();
          global.logger.log("Modelo de IA retreinado com sucesso", "INFO");
        }
        this.trainingInProgress = false;
      } catch (err) {
        global.logger.log(`Falha no retreinamento: ${err.message}`, "ERRO");
        this.trainingInProgress = false;
      }
    }
  }

  async forcarRetreinamento() {
    try {
      global.logger.log("Forçando retreinamento do modelo...", "INFO");
      this.ultimoTreino = 0;
      await this.retreinarModeloPeriodicamente();
    } catch (err) {
      global.logger.log(`Erro no retreinamento forçado: ${err.message}`, "ERRO");
    }
  }

  static getParametrosTurboPadrao() {
      return {
          risco: 2.5,
          lucroMinimo: 1.003,
          scalpLucro: 1.0006,
          volumeBase: 100,
          duracao: 30,
          quantidadeOperacoes: 3,
          timestamp: Date.now(),
          parametrosCalculados: {
              fatorProgresso: 1,
              fatorHorario: 1,
              fatorVolatilidade: 1
          }
      };
  }

  static analiseTurbo(estadoPar) {
    if (!estadoPar || typeof estadoPar !== 'object') {
        return this.getParametrosTurboPadrao();
    }

    try {
        // Garantir valores padrão para evitar cálculos com undefined
        if (config.SIMULA) {
            estadoPar.saldoInicialDia = estadoPar.saldoInicialDia || config.SALDO_INICIAL_USDT;
        } else {
            estadoPar.saldoInicialDia = estadoPar.saldoInicialDia || estadoPar.saldos?.USDT || 0;
        }

        const saldoInicialDia = estadoPar.saldoInicialDia;
        const lucroDia = estadoPar.lucroDia || 0;
        const metaDiaria = saldoInicialDia * config.LUCRO_DIARIO_ALVO;

       // Evitar divisão por zero
        // const progresso = metaDiaria > 0 ? Math.max(0, Math.min(1, lucroDia / metaDiaria)) : 0;
        const progresso = GerenciamentoRisco.calcularProgressoHorario(estadoPar);
        const horasRestantes = Math.max(1, 24 - new Date().getHours()); // Pelo menos 1 hora
        const volatilidade = estadoPar.volatilidade || 0.01; // Valor padrão seguro
        
        // Fatores de decisão com limites seguros
        const fatorProgresso = Math.max(0.5, Math.min(2.0, 1 + (1 - progresso)));
        const fatorHorario = Math.max(0.8, Math.min(1.5, 1 + (horasRestantes / 24)));
        const fatorVolatilidade = Math.max(0.7, Math.min(1.3, 1 + (volatilidade * 10)));

        // Cálculo dos parâmetros com validação rigorosa
        const risco = Math.min(5, Math.max(1, config.RISK_PER_TRADE * fatorProgresso * fatorHorario));
        const lucroMinimo = 1 + (0.003 * fatorProgresso * fatorVolatilidade);
        const scalpLucro = 1 + (0.0006 * fatorProgresso);
        const volumeBase = Math.min(200, Math.max(50, config.VOLUME_BASE * fatorProgresso));
        const duracao = Math.min(60, Math.max(15, 30 * fatorHorario));
        const quantidadeOperacoes = Math.min(5, Math.max(1, Math.floor(3 * fatorProgresso)));

        return {
            risco,
            lucroMinimo,
            scalpLucro,
            volumeBase,
            duracao,
            quantidadeOperacoes,
            timestamp: Date.now(),
            parametrosCalculados: {
                fatorProgresso,
                fatorHorario,
                fatorVolatilidade
            }
        };
    } catch (err) {
        console.error('Erro na análise turbo:', err);
        return this.getParametrosTurboPadrao();
    }
  }
}

// ====================== GERENCIAMENTO DE RISCO MULTI-MOEDA ======================
class GerenciamentoRisco {
      // Implementar no GerenciamentoRisco
      static calcularMetaHorariaAgressiva(estadoPar) {
          // Garantir que todos os valores necessários existam
          if (config.SIMULA) {
              estadoPar.saldoInicialDia = estadoPar.saldoInicialDia || config.SALDO_INICIAL_USDT;
          } else {
              estadoPar.saldoInicialDia = estadoPar.saldoInicialDia || estadoPar.saldos?.USDT || 0;
          }

          const saldoInicialDia = estadoPar.saldoInicialDia;
          const lucroDia = estadoPar.lucroDia || 0;
          
          // Calcular a meta diária REAL (não usar valores fixos)
          const metaDiaria = saldoInicialDia * config.LUCRO_DIARIO_ALVO;
          
          // Calcular progresso atual (limitado entre 0 e 2)
          const progressoAtual = metaDiaria > 0 ? 
              Math.max(0, Math.min(2, lucroDia / metaDiaria)) : 0;
          
          const horaAtual = Utils.calcularHoraAtual();
          const horasRestantes = Math.max(1, 24 - horaAtual); // Mínimo 1 hora
          
          // Meta horária base mais conservadora
          let metaBase = (metaDiaria - lucroDia) / horasRestantes;
          
          // Limitar a meta horária a valores razoáveis
          const metaMaxima = saldoInicialDia * 0.005; // Máximo 0.5% por hora
          metaBase = Math.min(metaBase, metaMaxima);
          
          // Ajuste baseado no progresso (menos agressivo)
          if (progressoAtual < 0.5 && horasRestantes < 6) {
              metaBase *= 1.5; // Aumento moderado de 50%
          }
          
          // Garantir valor mínimo e máximo
          return Math.max(saldoInicialDia * 0.0005, Math.min(metaBase, saldoInicialDia * 0.01));
      }

      static calcularProgressoHorario(estadoPar) {
          if (!estadoPar || !estadoPar.metaHoraria || estadoPar.metaHoraria <= 0) {
              return 0;
          }
          
          const lucroHorario = estadoPar.lucroHorario || 0;
          return Math.max(0, Math.min(1, lucroHorario / estadoPar.metaHoraria));
      }

      static async verificarViabilidade(simbolo, estadoPar, operacao) {
        // 0. Validação inicial
        if (!simbolo || !estadoPar) {
            await global.logger.log('Parâmetros inválidos para verificação', 'ERRO');
            return false;
        }
        
        const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
        let alertas = [];
        
        try {
            // 1. Verificar conectividade (latência crítica)
            const latencia = await ConexaoAPI.verificarConexao();
            if (latencia > 2000 || latencia === -1) {
                alertas.push(`Latência elevada: ${latencia}ms`);
                SistemaEmergencia.registrarEvento('HIGH_LATENCY', simbolo, latencia);
            }

            // 2. Verificar horário de mercado (evitar fins de semana)
            const agora = new Date();
            const diaSemana = agora.getUTCDay(); // 0 = Domingo, 6 = Sábado
            const horaUTC = agora.getUTCHours();
            
            // Evitar domingo e horários de baixa liquidez
            if (diaSemana === 0 || (diaSemana === 6 && horaUTC > 22) || (diaSemana === 1 && horaUTC < 8)) {
                alertas.push('Fora do horário ideal de operação');
            }

            // 3. Obter dados essenciais em paralelo
            const [volume24h, ordemBook, saldos] = await Promise.all([
                ConexaoAPI.obterVolume(simbolo).catch(() => estadoPar.volume24h || 0),
                ConexaoAPI.obterOrdemBook(simbolo).catch(() => null),
                ConexaoAPI.obterSaldoConta(estadoPar).catch(() => estadoPar.saldos)
            ]);

            // 4. Verificar volume mínimo
            const volumeMinimo = operacao.urgente ? 
              config.VOLUME_MINIMO_URGENTE : 
              (config.VOLUME_MINIMO[simbolo] || config.VOLUME_MINIMO.DEFAULT);

            if (volume24h < volumeMinimo) {
                alertas.push(`Volume 24h insuficiente: ${volume24h.toFixed(2)} < ${volumeMinimo}`);
            }

            // 5. Verificar spread e liquidez
            let spread = 0;
            let liquidez = 0;
            
            if (ordemBook?.bids?.length > 0 && ordemBook?.asks?.length > 0) {
                const melhorCompra = parseFloat(ordemBook.bids[0][0]);
                const melhorVenda = parseFloat(ordemBook.asks[0][0]);
                spread = (melhorVenda - melhorCompra) / melhorCompra;
                
                // Calcular liquidez nos primeiros 5 níveis
                liquidez = ordemBook.bids.slice(0, 5).reduce((total, bid) => {
                    return total + parseFloat(bid[0]) * parseFloat(bid[1]);
                }, 0);
            }
            
            if (spread > config.SPREAD_MAX_PERMITIDO) {
                alertas.push(`Spread alto: ${(spread * 100).toFixed(2)}%`);
            }

            // 6. Verificar saldo para operação
            const precoReferencia = estadoPar.precoAtual || (ordemBook ? (parseFloat(ordemBook.bids[0][0]) + parseFloat(ordemBook.asks[0][0])) / 2 : 0);
            
            if (operacao.tipo === 'COMPRA') {
                const custoEstimado = operacao.quantidade * precoReferencia * 1.005; // +0.5% para slippage
                if (saldos.USDT < custoEstimado) {
                    alertas.push(`Saldo USDT insuficiente: ${saldos.USDT.toFixed(2)} < ${custoEstimado.toFixed(2)}`);
                }
            } else { // VENDA
                if ((saldos?.[moedaBase] || 0) < operacao.quantidade) {
                    alertas.push(`Saldo ${moedaBase} insuficiente: ${saldos?.[moedaBase]} < ${operacao.quantidade}`);
                }
            }

            // 7. Verificar liquidez para o tamanho da operação
            const valorOperacao = operacao.quantidade * precoReferencia;
            if (liquidez < valorOperacao * 1.8) {
                alertas.push(`Liquidez insuficiente: ${liquidez.toFixed(2)} < ${(valorOperacao * 1.8).toFixed(2)}`);
            }

            // 8. Verificar volatilidade
            if (estadoPar.volatilidade > config.VOLATILIDADE_MAXIMA && !operacao.urgente) {
                alertas.push(`Volatilidade alta: ${(estadoPar.volatilidade * 100).toFixed(2)}%`);
            }

            // 9. Verificar limites diários
            if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA) {
                alertas.push(`Limite diário de trades atingido: ${estadoPar.tradesHoje}/${config.MAX_TRADES_DIA}`);
            }

            // 10. Verificar modo de recuperação
            if (estadoPar.modoRecuperacao && operacao.risco > config.RISCO_MAX_RECUPERACAO) {
                alertas.push('Operação arriscada bloqueada em modo recuperação');
            }

            // 11. Tomada de decisão final
            if (alertas.length > 0) {
                await global.logger.log(`[${simbolo}] Verificação bloqueada:\n  → ${alertas.join('\n  → ')}`, 'AVISO');
                
                // Registrar evento para análise posterior
                SistemaMonitoramento.registrarVerificacao({
                    simbolo,
                    status: 'BLOQUEADA',
                    alertas,
                    volume24h,
                    spread,
                    liquidez,
                    precoReferencia,
                    timestamp: new Date().toISOString()
                });
                
                return false;
            }

            // 12. Retorno positivo com dados adicionais
            SistemaMonitoramento.registrarVerificacao({
                simbolo,
                status: 'APROVADA',
                volume24h,
                spread,
                liquidez,
                precoReferencia,
                timestamp: new Date().toISOString()
            });

            return {
                aprovado: true,
                volume24h,
                spread,
                liquidez,
                precoReferencia
            };

        } catch (err) {
            await global.logger.log(`[${simbolo}] ERRO CRÍTICO na verificação: ${err.message}`, 'ERRO');
            
            // Fallback de emergência para operações urgentes
            return operacao.urgente ? {
                aprovado: true,
                motivo: 'APROVADO_EM_EMERGENCIA'
            } : false;
        }
    }

  static async verificarViabilidadeOperacional(simbolo, estadoPar, urgente = false) {
    const simboloStr = global.obterSimboloString(simbolo, estadoPar);
    const moedaBase = simboloStr.replace('USDT', '');

    const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;

    if (!MINORDER) {
      await global.logger.log(`[${simboloStr}] Configuração MINORDER não definida`, "ERRO");
      return false;
    }

    const MAX_TENTATIVAS = 10;
    let tentativa = 0;
    let delay = 1000;
    let data = null;
    let ultimoErro = null;

    // Circuit breaker para falhas consecutivas
    if (estadoPar.consecutiveAPIFailures > 8) {
      await global.logger.log(`[${simboloStr}] 🚧 Circuit breaker ativado. Evitando chamadas à API.`, 'ALERTA');
      SistemaEmergencia.gatilhosAtivos[simboloStr].falhaSistema = true;
      return false;
    }

    while (tentativa < MAX_TENTATIVAS) {
      try {
        // ✅ Verificação de conectividade server-side
        try {
          await dns.promises.resolve('google.com');
          SistemaEmergencia.limparGatilho(simboloStr, 'NO_INTERNET');
        } catch (dnsErr) {
          await global.logger.log('🌐 Sem conexão com internet', 'AVISO');
          SistemaEmergencia.registrarEvento('NO_INTERNET', simboloStr, { error: dnsErr.message });
          return false;
        }

        const agora = Date.now();
        
        // Verificar rate limit
        if (estadoPar.ultimoRateLimit && agora - estadoPar.ultimoRateLimit < 60000) {
          await global.logger.log(`[${simboloStr}] ⏳ Aguardando liberação de rate limit`, 'AVISO');
          await new Promise(r => setTimeout(r, 60000 - (agora - estadoPar.ultimoRateLimit)));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), urgente ? 3000 : 7000);

        const inicioRequisicao = Date.now();
        let latencia = 0;

        // Seleção de endpoint com fallback
        let url = `https://api.binance.com/api/v3/depth?symbol=${simboloStr}&limit=5`;
        if (tentativa > 1) {
          url = `https://api1.binance.com/api/v3/depth?symbol=${simboloStr}&limit=5`;
        }

        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'NodeBot/' + process.version + ' (Professional Trading System)'
          }
        });

        // CALCULAR LATÊNCIA
        latencia = Date.now() - inicioRequisicao;
        clearTimeout(timeoutId);

        // VERIFICAR LATÊNCIA E REGISTRAR/LIMPAR GATILHO
        if (latencia > 2000) {
          SistemaEmergencia.registrarEvento('HIGH_LATENCY', simboloStr, { latencia });
        } else {
          SistemaEmergencia.limparGatilho(simboloStr, 'HIGH_LATENCY');
        }

        // Tratamento de respostas HTTP
        if (!res.ok) {
          if (res.status === 429) {
            estadoPar.ultimoRateLimit = Date.now();
            const retryAfter = res.headers.get('Retry-After') || 60;
            await global.logger.log(`[${simboloStr}] ⚠️ Rate limit excedido. Nova tentativa após ${retryAfter}s`, 'AVISO');
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
          }
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        // Processamento dos dados
        data = await res.json();
        
        // Validação da resposta
        if (!data || !data.bids || !data.asks || 
            !Array.isArray(data.bids) || !Array.isArray(data.asks) || 
            data.bids.length === 0 || data.asks.length === 0) {
          throw new Error("Resposta da API incompleta ou inválida");
        }

        const bid = parseFloat(data.bids[0][0]);
        const ask = parseFloat(data.asks[0][0]);
        
        // Validação de valores
        if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) {
          throw new Error("Valores de bid/ask inválidos");
        }
        
        // Cálculo de spread
        const spread = (ask - bid) / bid;
        const custoTotal = spread + (config.TAXA_TAKER * 2);
        
        // VERIFICAR SPREAD E REGISTRAR/LIMPAR GATILHO
        const limiteSpread = urgente ? 0.005 : 0.0025;
        if (custoTotal > limiteSpread) {
          await global.logger.log(
            `[${simboloStr}] Spread+taxas ${(custoTotal*100).toFixed(2)}% > limite ${(limiteSpread*100).toFixed(2)}%`, 
            'AVISO'
          );
          SistemaEmergencia.registrarEvento('HIGH_SPREAD', simboloStr, { spread: custoTotal });
          return false;
        } else {
          SistemaEmergencia.limparGatilho(simboloStr, 'HIGH_SPREAD');
        }

        // Cálculo de liquidez
        let liquidez = 0;
        for (let i = 0; i < Math.min(5, data.bids.length); i++) {
          const preco = parseFloat(data.bids[i][0]);
          const quantidade = parseFloat(data.bids[i][1]);
          
          if (!isNaN(preco) && !isNaN(quantidade)) {
            liquidez += preco * quantidade;
          }
        }
        estadoPar.liquidez = liquidez;

        // VERIFICAR LIQUIDEZ E REGISTRAR/LIMPAR GATILHO
        const tamanhoPosicao = await GerenciamentoRisco.calcularTamanhoPosicao(simboloStr, estadoPar, estadoPar.precoAtual);
        const valorOrdem = tamanhoPosicao * estadoPar.precoAtual;
        const liquidezMinima = Math.max(1000, valorOrdem * 1.8);

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por verificarViabilidadeOperacional 1 ${simboloStr} <> ${tamanhoPosicao} <> ${valorOrdem} <> ${liquidezMinima} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
        
        if (liquidez < liquidezMinima) {
          await global.logger.log(
            `[${simboloStr}] Liquidez insuficiente: ${liquidez.toFixed(2)} < ${liquidezMinima} USDT`, 
            'AVISO'
          );
          SistemaEmergencia.registrarEvento('LOW_LIQUIDITY', simboloStr, { liquidez, minima: liquidezMinima });
          return false;
        } else {
          SistemaEmergencia.limparGatilho(simboloStr, 'LOW_LIQUIDITY');
        }

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por verificarViabilidadeOperacional 2 ${simboloStr} <> ${urgente} <> ${liquidez} <> ${liquidezMinima} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
        let volumeRecent = null
        let volumeMinimo = config.VOLUME_MINIMO_NORMAL;
        // Verificação de volume (apenas operações não urgentes)
        if (!urgente) {
          volumeRecent = await this.obterVolumeRecente(simboloStr);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por verificarViabilidadeOperacional 3 ${simboloStr} <>  ${volumeRecent} <> ${urgente} <> - logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 

          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por verificarViabilidadeOperacional 4 ${simboloStr} <> ${volumeRecent} <> ${volumeMinimo} <> ${liquidezMinima} - logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%  
          
          if (!volumeRecent) {
            volumeRecent = 0; // reatribuição, só possível com let
            // VERIFICAR VOLUME E REGISTRAR/LIMPAR GATILHO
            if (volumeRecent < volumeMinimo) {
              await global.logger.log(
                `[${simboloStr}] Volume recente baixo: ${volumeRecent.toFixed(2)} < ${volumeMinimo} USDT`, 
                'AVISO'
              );
              SistemaEmergencia.registrarEvento('LOW_VOLUME', simboloStr, { volume: volumeRecent, minimo: volumeMinimo });
              return false;
            } else {
              //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
              console.log(`[PASSO] Passou por verificarViabilidadeOperacional 4.1 ${simboloStr} <> ${volumeRecent} <> ${volumeMinimo} - logger.iniciado: ${global.logger?.iniciado}`);
              //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
              SistemaEmergencia.limparGatilho(simboloStr, 'LOW_VOLUME');
            }
          }
        }
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por verificarViabilidadeOperacional 5 ${simboloStr} <> ${volumeMinimo} <> ${liquidezMinima} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
        // Reset do contador de falhas
        estadoPar.consecutiveAPIFailures = 0;
        
        // Limpar quaisquer gatilhos de falha do sistema se chegamos até aqui
        SistemaEmergencia.limparGatilho(simboloStr, 'CIRCUIT_BREAKER');
        SistemaEmergencia.limparGatilho(simboloStr, 'API_FAILURE');
        
        return true;

      } catch (err) {
        tentativa++;
        ultimoErro = err;
        
        // Classificação de erros
        const errorType = err.name === 'AbortError' ? 'TIMEOUT' : 
                         err.message.includes('ECONN') ? 'CONNECTION' : 
                         'API_ERROR';

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por verificarViabilidadeOperacional 9 ${simboloStr} <> ${volumeRecent} <> ${tentativa} <> ${errorType} <> ${err.message} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%                 
        
        // Registrar falha
        SistemaEmergencia.registrarEvento('API_FAILURE', simboloStr, { 
          tentativa, 
          errorType, 
          message: err.message 
        });
        
        // Log detalhado
        await global.logger.log(
          `[${simboloStr}] Tentativa ${tentativa}/${MAX_TENTATIVAS} | ${errorType}: ${err.message}`, 
          tentativa === MAX_TENTATIVAS ? 'ERRO' : 'AVISO'
        );
        
        // Backoff exponencial com jitter
        const jitter = Math.random() * 500;
        delay = Math.min(30000, delay * 2 + jitter);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Tratamento pós-falhas
    estadoPar.consecutiveAPIFailures++;
    await global.logger.log(
      `[${simboloStr}] ❌ Falha após ${MAX_TENTATIVAS} tentativas. Último erro: ${ultimoErro ? ultimoErro.message : 'N/A'}`,
      'ERRO'
    );
    
    // Ativação de emergência
    SistemaEmergencia.registrarEvento('CIRCUIT_BREAKER', simboloStr, { 
      failures: estadoPar.consecutiveAPIFailures,
      lastError: ultimoErro ? ultimoErro.message : 'N/A'
    });
    
    return false;
  }

  static async calcularTamanhoPosicao(simbolo, estadoPar, preco) {
    try {
      const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
      
      if (!preco || isNaN(preco) || preco <= 0) {
        await global.logger.log(`[${simbolo}] Preço inválido para cálculo de posição: ${preco}`, 'ERRO');
        return 0;
      }

      if (estadoPar.saldos?.USDT < config.VALOR_MINIMO_ORDEM) {
        await global.logger.log(`[${simbolo}] Saldo USDT insuficiente: ${estadoPar.saldos?.USDT.toFixed(2)} < ${config.VALOR_MINIMO_ORDEM}`, 'AVISO');
        return 0;
      }

      let kellyFraction = 0.08;
      const { winRate, avgWin, avgLoss } = estadoPar.performanceStats;

      if (avgLoss > 0 && avgWin > 0 && winRate >= 0 && winRate <= 1) {
        const ratio = avgWin / avgLoss;
        kellyFraction = winRate - (1 - winRate) / ratio;

        if (!isFinite(kellyFraction) || isNaN(kellyFraction)) {
          kellyFraction = 0.08;
        } 
      }
      
      const fracaoRisco = Math.min(0.25, Math.max(0.08, kellyFraction));
      let tamanhoBaseUSDT = estadoPar.saldos?.USDT * fracaoRisco;

      tamanhoBaseUSDT = Math.min(tamanhoBaseUSDT, estadoPar.modoRecuperacao ? 70 : 50);

      if (tamanhoBaseUSDT < config.VALOR_MINIMO_ORDEM) {
        await global.logger.log(`[${simbolo}] Valor da posição abaixo do mínimo: ${tamanhoBaseUSDT.toFixed(2)} < ${config.VALOR_MINIMO_ORDEM}`, 'AVISO');
        return 0;
      }

      let quantidade = tamanhoBaseUSDT / preco;
      
      const volatilidadeFactor = Math.min(4, 1 + (estadoPar.volatilidade * 60));
      quantidade *= volatilidadeFactor;
      
      const minutosInativo = estadoPar.ultimaOperacaoTimestamp ? 
            (Date.now() - estadoPar.ultimaOperacaoTimestamp) / (1000 * 60) : 60;
      
      if (minutosInativo > 15) {
        const inatividadeFactor = Math.min(2.0, 1 + (minutosInativo / 30));
        quantidade *= inatividadeFactor;
      }

      const riscoMaximo = estadoPar.saldos?.USDT * (this.calcularRiskPerTrade(estadoPar) / 100);
      const riscoPosicao = quantidade * preco * (config.TAXA_TAKER * 2 + 0.005);
      if (riscoPosicao > riscoMaximo) {
        quantidade = (riscoMaximo / (config.TAXA_TAKER * 2 + 0.005)) / preco;
      }

      const valorMaximo = estadoPar.saldos?.USDT * 0.98;
      if (quantidade * preco > valorMaximo) {
        quantidade = valorMaximo / preco;
      }

      // Obter configurações específicas da moeda
      const MINORDER = config.MINORDER?.[moedaBase] || config.MINORDER?.DEFAULT || 0.01;
      const precision = config.precision?.[moedaBase] || config.precision?.DEFAULT || 6;
      quantidade = parseFloat(quantidade.toFixed(precision));

      if (quantidade < MINORDER) {
        await global.logger.log(`[${simbolo}] Quantidade abaixo do mínimo: ${quantidade} < ${MINORDER} ${moedaBase}`, 'AVISO');
        return 0;
      }

      const volume24h = await this.obterVolume24h(simbolo);
      const volume24hValido = volume24h > 0 ? volume24h : 1000000; // Fallback para evitar divisão por zero
      const impactoMercado = quantidade * preco / volume24hValido;

      if (impactoMercado > 0.0008) {
        quantidade *= 0.9;
        await global.logger.log(`[${simbolo}] Reduzindo posição para evitar slippage: ${(impactoMercado*100).toFixed(3)}%`, 'AVISO');
      }
 
      return quantidade;
    } catch (err) {
      await global.logger.log(`[${simbolo}] Erro no cálculo de posição: ${err.message}`, 'ERRO');
      return 0;
    }
  }

  static async verificarCustoBeneficio(simbolo, estadoPar, qtd, preco) {
    const simboloStr = global.obterSimboloString(simbolo, estadoPar);
    const { total: taxaEstimada } = await this.preverTaxasAvancado(simboloStr, qtd, preco);
    const ganhoMinimo = (estrategia.LUCRO_MINIMO - 1) * (qtd * preco);
    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    console.log(`[PASSO] Passou por verificarCustoBeneficio 1 ${simboloStr, qtd, taxaEstimada, ganhoMinimo, estrategia.LUCRO_MINIMO, preco}- logger.iniciado: ${global.logger?.iniciado}`);
    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
    
    if (taxaEstimada > ganhoMinimo * 0.7) {
      await global.logger.log(
        `[${simbolo}] Bloqueado: Taxas ${(taxaEstimada*100).toFixed(3)}% > ${(ganhoMinimo*0.7*100).toFixed(3)}% do lucro`, 
        'AVISO'
      );
      return false;
    }
    return true;
  }

  static atualizarPrioridadeHoraria(estadoPar) {
    const hora = Utils.calcularHoraAtual();
    estadoPar.fatorPrioridade = estadoPar.horariosPrioritarios.includes(hora) ? 2.0 : 1.0;
    return estadoPar.fatorPrioridade;
  }

  // Atualize o método verificarMetaHorariaAgressiva
  static async verificarMetaHorariaAgressiva(simbolo, estadoPar) {
      const simboloStr = global.obterSimboloString(simbolo, estadoPar);
      const moedaBase = simboloStr.replace('USDT', '');
      
      // Calcular meta horária corretamente
      estadoPar.metaHoraria = this.calcularMetaHorariaAgressiva(estadoPar);
      
      // Calcular progresso com valores válidos
      // const progresso = estadoPar.metaHoraria > 0 ?
      //     (estadoPar.lucroHorario || 0) / estadoPar.metaHoraria : 0;

      const progresso = this.calcularProgressoHorario(estadoPar);
      
      const hora = Utils.calcularHoraAtual();
      
      // Verificar turbo recente com validação
      const turboRecente = estadoPar.ultimoTurboForcado ?
          (Date.now() - estadoPar.ultimoTurboForcado) < 600000 : false;
      
      // Condições mais restritas para ativação do turbo
      if (progresso < 0.4 && hora >= 7 && hora <= 23 && !turboRecente) {
          this.ativarModoTurbo(simbolo, estadoPar);
          estadoPar.ultimoTurboForcado = Date.now();
      }
      
      // Operações turbo apenas em condições específicas
      if (progresso < 0.5 && hora >= 8 && hora <= 22) {
          // Limitar número de operações turbo
          const maxOperacoesTurbo = Math.min(2, config.MAX_TRADES_DIA - estadoPar.tradesHoje);
          
          for (let i = 0; i < maxOperacoesTurbo; i++) {
              if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA) break;
              
              if (estadoPar.saldos?.USDT < config.VALOR_MINIMO_ORDEM) {
                  await global.logger.log(`[${simbolo}] Saldo USDT insuficiente para operações TURBO`, "AVISO");
                  break;
              }
              
              const qtd = await this.calcularTamanhoPosicaoTurbo(simbolo, estadoPar, estadoPar.precoAtual);
              
              if (qtd > (config.MINORDER[moedaBase] || config.MINORDER.DEFAULT)) {
                  const podeComprar = await this.verificarCustoBeneficioTurbo(simbolo, estadoPar, qtd, estadoPar.precoAtual);
                  if (podeComprar) {
                      await Ordem.executarCompra(simbolo, estadoPar, estadoPar.precoAtual, qtd, 'TURBO META');
                      estadoPar.takeProfit = estadoPar.ultimaCompra * 1.0015;
                      estadoPar.stopLoss = estadoPar.ultimaCompra * 0.998;
                  }
              }
              await new Promise(r => setTimeout(r, 300));
          }
      }
  }

  static async verificarCustoBeneficioTurbo(simbolo, estadoPar, qtd, preco) {
    const { total: taxaEstimada } = await this.preverTaxasAvancado(simbolo, qtd, preco);
    const lucroMinimo = 0.0006;

    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    console.log(`[PASSO] Passou por verificarCustoBeneficioTurbo 1 ${simbolo} <> ${qtd} <> ${preco} <> ${taxaEstimada} <>${lucroMinimo * 0.7}- logger.iniciado: ${global.logger?.iniciado}`);
    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
    
    if (taxaEstimada > lucroMinimo * 0.7) {
      await global.logger.log(
        `[${simbolo}] Taxa prevista ${(taxaEstimada*100).toFixed(3)}% > ${(lucroMinimo*70).toFixed(3)}% do lucro mínimo. Cancelando.`,
        'AVISO'
      );
      return false;
    }
    return true;
  }

  static ativarModoTurbo(simbolo, estadoPar) {
    if (estadoPar.modoRecuperacao) return;
  
    estadoPar.modoRecuperacao = true;
    config.RISK_PER_TRADE = 2.5;
    estrategia.LUCRO_MINIMO = 1.003;
    config.VOLUME_BASE = 100;
    estadoPar.turboExpira = Date.now() + 1800000;

    estrategia.SCALP_LUCRO_MINIMO = 1.0006;
    estrategia.ESPERA_ENTRE_OPERACOES = 800;
    estrategia.RSI_COMPRA_MAX = 55;
  
    global.logger.log(
      `[${simbolo}] ⚡ TURBO ATIVADO! Risk/Trade: ${config.RISK_PER_TRADE}% | ` +
      `Lucro Mín: ${((estrategia.LUCRO_MINIMO-1)*100).toFixed(3)}%`,
      'ALERTA'
    );
  }

    // Modo Turbo com parametrização por IA
    static ativarModoTurboComIA(simbolo, estadoPar) {
      if (estadoPar.modoRecuperacao) return;
      try {
          // Consultar IA para parâmetros ideais
          const decisaoIA = TradingAI.analiseTurbo(estadoPar);
          
          estadoPar.modoTurbo = true;
          estadoPar.turboExpira = Date.now() + (decisaoIA.duracao * 60000);
          
          // Aplicar parâmetros sugeridos pela IA
          config.RISK_PER_TRADE = decisaoIA.risco;
          estrategia.LUCRO_MINIMO = decisaoIA.lucroMinimo;
          estrategia.SCALP_LUCRO_MINIMO = decisaoIA.scalpLucro;
          config.VOLUME_BASE = decisaoIA.volumeBase;
          
          // global.logger.log(
          //   `[${simbolo}] ⚡ TURBO IA ATIVADO! Parâmetros: ${JSON.stringify(decisaoIA)}`,
          //   'ALERTA'
          // );
          
          // Executar operações turbo imediatamente
          this.executarOperacoesTurbo(simbolo, estadoPar, decisaoIA.quantidadeOperacoes);
      } catch (err) {
        console.error('Erro ao ativar modo turbo com IA:', err);
        // Fallback para turbo padrão em caso de erro
        this.ativarModoTurbo(simbolo, estadoPar);
      }
    }

    static inicializarValoresMeta(estado) {
        // Garantir que todos os valores necessários existam
        if (config.SIMULA) {
            estado.saldoInicialDia = estado.saldoInicialDia || config.SALDO_INICIAL_USDT;
        } else {
            estado.saldoInicialDia = estado.saldoInicialDia || estado.saldos?.USDT || 0;
        }
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por inicializarValoresMeta 1   ${estado.saldoInicialDia}  <> ${config.SIMULA} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        const saldoInicialDia = estado.saldoInicialDia;
        estado.lucroDia = estado.lucroDia || 0; 
        estado.lucroHorario = estado.lucroHorario || 0;
        estado.metaHoraria = estado.metaHoraria || this.calcularMetaHorariaAgressiva(estado);
        
        // Inicializar histórico de lucro horário se não existir
        if (!estado.historicoLucroHorario) {
            estado.historicoLucroHorario = [];
        }
        
        // Registrar lucro horário atual
        const horaAtual = Utils.calcularHoraAtual();
        if (estado.ultimaHoraRegistrada !== horaAtual) {
            estado.historicoLucroHorario.push({
                hora: horaAtual,
                lucro: estado.lucroHorario || 0
            });
            estado.ultimaHoraRegistrada = horaAtual;
            estado.lucroHorario = 0; // Reset para a próxima hora
        }

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por inicializarValoresMeta 2   ${saldoInicialDia} <> ${estado.saldoInicialDia}  <> ${config.SIMULA} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        console.log(`[${estado.simbolo}] Meta horária calculada: ${estado.metaHoraria}`);
        console.log(`[${estado.simbolo}] Saldo inicial dia: ${estado.saldoInicialDia}`);
        console.log(`[${estado.simbolo}] Lucro dia: ${estado.lucroDia}`);
    }

    // ====================== MÉTODOS DE TURBO ======================
    static async executarOperacoesTurbo(simbolo, estadoPar, quantidadeOperacoes = 3) {
        const simboloStr = global.obterSimboloString(simbolo, estadoPar);
        const moedaBase = simboloStr.replace('USDT', '');
        
        await global.logger.log(
            `[${simboloStr}] 🚀 Executando ${quantidadeOperacoes} operações TURBO`,
            'ALERTA'
        );

        let operacoesExecutadas = 0;
        
        for (let i = 0; i < quantidadeOperacoes; i++) {
            if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA) {
                await global.logger.log(`[${simboloStr}] Limite diário de trades atingido`, 'AVISO');
                break;
            }

            if (estadoPar.emOperacao) {
                // Se já está em operação, tentar vender primeiro
                await this.executarVendaTurbo(simboloStr, estadoPar);
                await new Promise(resolve => setTimeout(resolve, 800)); // Pequena pausa
            }

            // Executar compra turbo
            const sucesso = await this.executarCompraTurbo(simboloStr, estadoPar);
            
            if (sucesso) {
                operacoesExecutadas++;
                // Pequena pausa entre operações
                if (i < quantidadeOperacoes - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }
            } else {
                await global.logger.log(`[${simboloStr}] Falha na operação turbo ${i+1}`, 'AVISO');
            }
        }

        await global.logger.log(
            `[${simboloStr}] ✅ ${operacoesExecutadas}/${quantidadeOperacoes} operações turbo concluídas`,
            'ALERTA'
        );
    }

    static async executarCompraTurbo(simbolo, estadoPar) {
        try {
            const moedaBase = simbolo.replace('USDT', '');
            const preco = estadoPar.precoAtual;
            
            if (!preco || preco <= 0) {
                await global.logger.log(`[${simbolo}] Preço inválido para turbo: ${preco}`, 'ERRO');
                return false;
            }

            // Calcular quantidade com multiplicador turbo
            const qtdNormal = await this.calcularTamanhoPosicao(simbolo, estadoPar, preco);
            const qtdTurbo = qtdNormal * 1.8; // 80% a mais no turbo
            
            const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;
            
            if (qtdTurbo < MINORDER) {
                await global.logger.log(
                    `[${simbolo}] Quantidade turbo abaixo do mínimo: ${qtdTurbo} < ${MINORDER} ${moedaBase}`,
                    'AVISO'
                );
                return false;
            }

            // Verificar custo-benefício com parâmetros mais flexíveis para turbo
            const { total: taxaEstimada } = await this.preverTaxasAvancado(simbolo, qtdTurbo, preco);
            const ganhoMinimo = (1.0015 - 1) * (qtdTurbo * preco); // Lucro mínimo de 0.15% no turbo
            
            if (taxaEstimada > ganhoMinimo * 0.9) {
                await global.logger.log(
                    `[${simbolo}] Taxas altas para turbo: ${(taxaEstimada*100).toFixed(3)}% > ${(ganhoMinimo*0.9*100).toFixed(3)}%`,
                    'AVISO'
                );
                return false;
            }

            // Executar compra
            await Ordem.executarCompra(simbolo, estadoPar, preco, qtdTurbo, 'TURBO COMPRA');

            // Configurar take profit e stop loss agressivos
            estadoPar.takeProfit = preco * 1.0025; // 0.25% de lucro
            estadoPar.stopLoss = preco * 0.9985;    // 0.15% de stop loss
            estadoPar.ultimaCompraTimestamp = Date.now();
            
            return true;
            
        } catch (err) {
            await global.logger.log(`[${simbolo}] Erro na compra turbo: ${err.message}`, 'ERRO');
            return false;
        }
    }

    static async executarVendaTurbo(simbolo, estadoPar) {
        try {
            const moedaBase = simbolo.replace('USDT', '');
            
            // Atualizar saldos antes de verificar
            await ConexaoAPI.obterSaldoConta(estadoPar);
            
            const preco = estadoPar.precoAtual;
            let qtd = estadoPar.saldos[moedaBase] || 0;
            
            const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;
            
            if (qtd < MINORDER) {
                await global.logger.log(
                    `[${simbolo}] Quantidade insuficiente para venda turbo: ${qtd} < ${MINORDER} ${moedaBase}`,
                    'AVISO'
                );
                return false;
            }

            // Verificar se a quantidade não excede o saldo disponível
            const saldoDisponivel = estadoPar.saldos[moedaBase] || 0;
            if (qtd > saldoDisponivel) {
                await global.logger.log(
                    `[${simbolo}] Ajustando quantidade para venda turbo: ${qtd} -> ${saldoDisponivel} ${moedaBase}`,
                    'AVISO'
                );
                qtd = saldoDisponivel;
            }

            // Verificar novamente após ajuste
            if (qtd < MINORDER) {
                await global.logger.log(
                    `[${simbolo}] Quantidade insuficiente após ajuste: ${qtd} < ${MINORDER} ${moedaBase}`,
                    'AVISO'
                );
                return false;
            }

            // Executar venda
            await Ordem.executarVenda(simbolo, estadoPar, preco, null, 'TURBO VENDA');
            
            return true;
            
        } catch (err) {
            await global.logger.log(`[${simbolo}] Erro na venda turbo: ${err.message}`, 'ERRO');
            return false;
        }
    }

    static calcularTamanhoPosicaoTurbo(simbolo, estadoPar, preco) {
      const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');

      if (!config.MINORDER || !config.MINORDER[moedaBase]) {
        console.error(`Configuração MINORDER não encontrada para ${moedaBase}`);
        return 0;
      }

      const capitalTotal = (estadoPar.saldos?.USDT || 0) + 
                      ((estadoPar.saldos?.[moedaBase] || 0) * preco);
      const metaFaltante = (estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO) - estadoPar.lucroDia;
      const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;
      
      if (!MINORDER) {
        throw new Error("Configuração MINORDER não definida");
      }

      let tamanhoBaseUSDT = capitalTotal * 0.07;

      // Ajusta tamanho baseado no quanto falta para a meta
      if (metaFaltante > 0) {
        const proporcaoMeta = metaFaltante / (estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO);
        tamanhoBaseUSDT *= Math.min(1, Math.max(0.2, proporcaoMeta)); // nunca abaixo de 20% do valor base
      } else {
      // Se já bateu a meta, diminui risco
      tamanhoBaseUSDT *= 0.1; 
      }
    
      const limiteVolume = estadoPar.liquidez * 0.25;
      tamanhoBaseUSDT = Math.min(tamanhoBaseUSDT, limiteVolume);

      return tamanhoBaseUSDT / preco;
    }

  static async calcularVolumeMensal(simbolo) {
    try {
      const res = await fetch(`${getBinanceBaseUrl()}/api/v3/ticker/24hr?symbol=${simbolo}`);
      const data = await res.json();
      return parseFloat(data.quoteVolume) * 30;
    } catch {
      return 0;
    }
  }

  static async verificarSaldoBNB() {
    if (!config.USAR_BNB_PARA_TAXAS) return false;
    
    try {
      if (config.SIMULA) {
        return await haBNBSuficiente(estadoPar);
      }

      const timestamp = Date.now();
      const query = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', config.API_SECRET).update(query).digest('hex');

      const url = `${getBinanceBaseUrl()}/api/v3/account?${query}&signature=${signature}`;
      const res = await fetch(url, {
        headers: { 'X-MBX-APIKEY': config.API_KEY }
      });
      
      const data = await res.json();
      const bnbBalance = data.balances.find(b => b.asset === 'BNB');
      return parseFloat(bnbBalance.free) > 1;
    } catch {
      return false;
    }
  }

  static async calcularTaxas(simbolo, qtd, preco, isTaker = true) {
    try {
      const volumeMensal = await this.calcularVolumeMensal(simbolo);
      const descontoVolume = volumeMensal > 1000000 ? 0.2 : 
                           volumeMensal > 500000 ? 0.1 : 0;
      
      let taxaBase = isTaker ? config.TAXA_TAKER : config.TAXA_MAKER;
      let taxaComDescontos = Math.max(0.0005, taxaBase * (1 - config.TAXA_DESCONTO_BNB) * (1 - descontoVolume));

      const temBNB = await this.verificarSaldoBNB();
      const descontoBNB = temBNB ? 0.25 : 0;
      const taxaFinal = taxaComDescontos * (1 - descontoBNB);
      
      const valor = qtd * preco;
      const total = valor * taxaFinal;

      return {
        taxa: total,
        valorLiquido: valor - total,
        taxaPercentual: taxaFinal * 100
      };
    } catch (err) {
      const taxaBase = isTaker ? config.TAXA_TAKER : config.TAXA_MAKER;
      const valor = qtd * preco;
      const total = valor * taxaBase;
      
      return {
        taxa: total,
        valorLiquido: valor - total,
        taxaPercentual: taxaBase * 100
      };
    }
  }

  static calcularVolumeDinamico(estadoPar) {
    const { volatilidade, emaShort, emaLong, liquidez } = estadoPar;
    
    const trendStrength = Math.abs(emaShort - emaLong) / ((emaShort + emaLong) / 2) * 100;
    
    let volumeMultiplier = 1;
    
    if (volatilidade > 0.02) {
      volumeMultiplier = 0.6;
    } else if (trendStrength > 1.5) {
      volumeMultiplier = 1.3;
    } else if (liquidez < 5000) {
      volumeMultiplier = 0.4;
    }
    
    return Math.floor(config.VOLUME_BASE * volumeMultiplier);
  }

  static calcularRiskPerTrade(estadoPar) {
    const progressoDia = estadoPar.lucroDia / (estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO);
    const fatorProgresso = progressoDia < 0.5 ? 1.5 : 0.8;
    const volFactor = Math.min(2, 1 + (estadoPar.volatilidade * 20));
    const hora = Utils.calcularHoraAtual();
    const horaFactor = 1 + ((24 - hora) / 48);
    
    return Math.min(5, Math.max(0.5, 
      config.RISK_PER_TRADE * volFactor * fatorProgresso * horaFactor
    ));
  }

  static async verificarMicroOportunidades(simbolo, estadoPar) {
try {
      // Garantir que estamos passando string para calcularTamanhoPosicao
      let simboloStr;
      
      // Se já for string, usa diretamente
      if (typeof simbolo === 'string') {
        simboloStr = simbolo;
      } 
      // Se for objeto com propriedade 'simbolo', extrai
      else if (simbolo && typeof simbolo.simbolo === 'string') {
        simboloStr = simbolo.simbolo;
      }
      // Se não, tenta usar a função global
      else {
        // Verifica se a função existe e se estadoPar é válido
        if (typeof global.obterSimboloString === 'function' && estadoPar) {
          simboloStr = global.obterSimboloString(simbolo, estadoPar);
        } else {
          throw new Error('Não foi possível determinar o símbolo');
        }
      }
      
      // Agora obtém a moeda base de forma consistente
      const moedaBase = simboloStr.replace('USDT', '');

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por verificarMicroOportunidades (0) ${simboloStr}  <> ${moedaBase} - logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      // 2. Verificar estado válido
      if (!estadoPar || typeof estadoPar !== 'object') {
         await global.logger.log(`[${simboloStr}] EstadoPar inválido`, 'ERRO');
         return;
      }
      
      if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA) return;
      
      const agora = Date.now();
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por verificarMicroOportunidades 1 ${simboloStr}  <> ${moedaBase} <> ${estadoPar.precoAtual} - logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
      if (estadoPar.ultimaOperacaoTimestamp && (agora - estadoPar.ultimaOperacaoTimestamp) < estrategia.ESPERA_ENTRE_OPERACOES) {
        return;
      }

      if (!estadoPar.emOperacao && Indicadores.deveComprar(estadoPar)) {
          const preco = estadoPar.precoAtual;
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por verificarMicroOportunidades 1.1 ${simboloStr}  <> ${estadoPar} <> ${preco} - logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
          const qtd = await this.calcularTamanhoPosicao(simboloStr, estadoPar, preco);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por verificarMicroOportunidades 1.2 ${moedaBase}  <> ${estadoPar} <> ${qtd} - logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
          const MINORDER = config.MINORDER?.[moedaBase] || config.MINORDER?.DEFAULT || 0.01;

          // 1. Verificar se quantidade é válida
          if (qtd <= MINORDER) {
            await global.logger.log(
              `[${simboloStr}] Quantidade abaixo do mínimo: ${qtd} < ${MINORDER} ${moedaBase}`,
              'AVISO'
            );
            return;
          }

        // 2. Verificar custo/benefício
        const podeComprar = await this.verificarCustoBeneficio(simboloStr, estadoPar, qtd, preco);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por verificarMicroOportunidades 2 ${podeComprar}  <> ${simboloStr}  <>  ${preco} <> ${qtd}- logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
        if (!podeComprar) {
          await global.logger.log(`[${simboloStr}] Compra cancelada: custo/benefício ruim`, 'AVISO');
          return;
        }
          await Ordem.executarCompra(simboloStr, estadoPar, preco, qtd,  'MICRO OPORTUNIDADE');
      }
      else if (estadoPar.emOperacao && Indicadores.deveVender(estadoPar)) {
        const preco = estadoPar.precoAtual;
        const qtd = estadoPar.saldos?.[moedaBase] || 0;
        
        if (qtd > config.MINORDER[moedaBase]) {
          const podeVender = await this.verificarCustoBeneficio(simboloStr, estadoPar, qtd, preco);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por verificarMicroOportunidades 3 ${podeVender}  <> ${simboloStr}  <>  ${preco} <> ${qtd}- logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
          if (!podeVender) {
            await global.logger.log(`[${simbolo}] Venda cancelada: custo/benefício ruim`, 'AVISO');
            return;
          }
        }
        await Ordem.executarVenda(simboloStr, estadoPar, preco, qtd, 'MICRO OPORTUNIDADE');
      }
    } catch (err) {
      await global.logger.log(`[${simbolo}] Erro na verificação de micro oportunidades: ${err.message}`, 'ERRO');
    }
  }

  static async forcarTradeInicial(simbolo, estadoPar) {
    const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
    const hora = Utils.calcularHoraAtual();
    
    if (hora < 10 || hora > 20) return;
    
    const tempoExecucao = (Date.now() - new Date(estadoPar.inicioExecucao).getTime()) / 3600000;
    
    if (estadoPar.tradesHoje === 0 && tempoExecucao > 1) {
      const precoAtual = estadoPar.precoAtual;
      const qtd = await this.calcularTamanhoPosicao(simbolo, estadoPar, precoAtual) * 0.7;

      if (qtd > config.MINORDER[moedaBase]) {
        const podeComprar = await this.verificarCustoBeneficio(simbolo, estadoPar, qtd, precoAtual);
        if (!podeComprar) {
          await global.logger.log(`[${simbolo}] Compra cancelada: custo/benefício ruim`, 'AVISO');
          return;
        }
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por forcarTradeInicial 1 ${simbolo}  <>  ${podeComprar} <> ${precoAtual} <> ${qtd} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
        await global.logger.log(`[${simbolo}] Ativando trade forçado por inatividade`, "ALERTA");
        await Ordem.executarCompra(simbolo, estadoPar, precoAtual, qtd, 'FORÇADO INICIAL');
        
        estadoPar.takeProfit = precoAtual * 1.004;
        estadoPar.stopLoss = precoAtual * 0.997;
      }
    }
  }

  static async obterVolume24h(simbolo) {
    try {
      const url = `${getBinanceBaseUrl()}/api/v3/ticker/24hr?symbol=${simbolo}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'NodeBot/' + process.version,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      return parseFloat(data.quoteVolume) || 1000000000;
    } catch (err) {
      await global.logger?.log(
        `[${simbolo}] Erro ao obterVolume24h: ${err.message}`,
        'ERRO'
      );
      return 1000000000; // fallback
    }
  }


  static atualizarStopMovel(simbolo, estadoPar, preco) {
    const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
    if (!estadoPar.stopMovel || !estadoPar.emOperacao) return;
    
    const fator = 1.5 + (estadoPar.volatilidade * 10);
    
    if (estadoPar.tendencia === 'ALTA') {
      const novoStop = preco - (estadoPar.atr * fator);
      estadoPar.stopMovel = Math.max(estadoPar.stopMovel, novoStop);
    } else if (estadoPar.tendencia === 'BAIXA') {
      const novoStop = preco + (estadoPar.atr * fator);
      estadoPar.stopMovel = Math.min(estadoPar.stopMovel, novoStop);
    }
  }

  static calcularTakeProfit(precoCompra, estadoPar) {
    const tpBase = precoCompra * estrategia.LUCRO_MINIMO;
    const tpVol = estadoPar.atr * 3 * (1 + estadoPar.volatilidade * 15);
    const metaFaltante = (estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO) - estadoPar.lucroDia;
    const tpMeta = precoCompra * (1 + (metaFaltante / (estadoPar.saldos?.USDT * 0.8)));
    const tpAgresivo = precoCompra * (1 + (0.005 * (1 + estadoPar.volatilidade * 25)));
    
    return Math.max(tpBase, precoCompra + tpVol, tpMeta, tpAgresivo);
  }

static async verificarProtecoes(simbolo, estadoPar, preco) {
    if (!estadoPar || typeof estadoPar !== 'object' || Array.isArray(estadoPar)) {
        await global.logger.log(`[${simbolo}] EstadoPar inválido: ${typeof estadoPar}`, 'ERRO');
       return false;
    }
    try {
        // 1. Obtenção segura da moeda base
        let moedaBase = '';
        if (estadoPar && estadoPar.simbolo) {
            moedaBase = (typeof estadoPar.simbolo === 'string' 
                ? estadoPar.simbolo 
                : estadoPar.simbolo.simbolo || ''
            ).replace('USDT', '');
        }

        // 2. Acesso seguro ao MINORDER com fallbacks
        const configSafe = config || global.config || {};
        const MINORDER = moedaBase 
            ? (configSafe.MINORDER?.[moedaBase] || configSafe.MINORDER?.DEFAULT || 0.001)
            : 0.001;
        
        // 3. Verificação de propriedades essenciais
        if (!estadoPar || !estadoPar.saldos || !moedaBase) {
            return false;
        }
        
        // 4. Função auxiliar para verificar e executar vendas
        const tentarVenda = async (condicao, motivo) => {
            if (!condicao) return false;
            
            const saldoMoeda = estadoPar.saldos?.[moedaBase] || 0;
            if (saldoMoeda <= MINORDER) return false;
            
            const podeVender = await this.verificarCustoBeneficio(simbolo, estadoPar, saldoMoeda, preco);
            if (!podeVender) {
                await global.logger.log(`[${simbolo}] Venda cancelada: custo/benefício ruim para ${saldoMoeda} ${moedaBase} a ${preco}`, 'AVISO');
                return false;
            }

            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
            console.log(`[PASSO] Passou por verificarProtecoes 1 ${simbolo}  <>  ${saldoMoeda} <> ${preco} <> ${podeVender} <> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
           //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
            
            await Ordem.executarVenda(simbolo, estadoPar, preco, saldoMoeda,'PROTEÇÃO DE PERDA');
            return true;
        };

        // 5. Verificação de proteções com validações completas
        
        // Stop Loss
        if (await tentarVenda(
            estadoPar.stopLoss && preco <= estadoPar.stopLoss,
            'STOP LOSS'
        )) return true;
        
        // Take Profit
        if (await tentarVenda(
            estadoPar.takeProfit && preco >= estadoPar.takeProfit,
            'TAKE PROFIT'
        )) return true;
        
        // Stop Móvel
        const condicaoStopMovel = estadoPar.stopMovel && estadoPar.tendencia && (
            (estadoPar.tendencia === 'ALTA' && preco <= estadoPar.stopMovel) ||
            (estadoPar.tendencia === 'BAIXA' && preco >= estadoPar.stopMovel)
        );
        if (await tentarVenda(condicaoStopMovel, 'STOP MÓVEL')) return true;
        
        // Max Drawdown (com verificação de precoRef)
        if (estadoPar.precoRef && configSafe.MAX_DRAWDOWN) {
            const drawdown = (estadoPar.precoRef - preco) / estadoPar.precoRef;
            if (await tentarVenda(
                drawdown > (configSafe.MAX_DRAWDOWN / 100),
                'MAX DRAWDOWN'
            )) return true;
        }
        
        // Proteção de Perda (com verificação de última compra)
        if (estadoPar.emOperacao && estadoPar.ultimaCompra && configSafe.RISK_PER_TRADE) {
            const perdaAtual = (estadoPar.ultimaCompra - preco) / estadoPar.ultimaCompra;
            const perdaMaximaPermitida = configSafe.RISK_PER_TRADE / 100 * 0.7;
            if (await tentarVenda(
                perdaAtual > perdaMaximaPermitida,
                'PROTEÇÃO DE PERDA'
            )) return true;
        }
        
        return false;
    } catch (err) {
        await global.logger.log(`[${simbolo}] Erro em verificarProtecoes: ${err.message}`, 'ERRO');
        return false;
    }
   }

    static async verificarCompraPiramidal(simbolo, estadoPar) {
      try {
          // 1. Obter o símbolo de forma segura
          let symbolString = '';
          
          if (typeof simbolo === 'string') {
              symbolString = simbolo;
          } else if (simbolo && typeof simbolo === 'object') {
              // Tenta obter de propriedade 'simbolo' ou do próprio objeto
              symbolString = simbolo.simbolo || simbolo.symbol || '';
          } else if (estadoPar && estadoPar.simbolo) {
              // Fallback para estadoPar se disponível
              symbolString = estadoPar.simbolo;
          }

          // 2. Extrair moeda base com validação
          const moedaBase = symbolString ? symbolString.replace('USDT', '') : '';

          // 3. Acesso seguro ao MINORDER
          const configSafe = typeof config !== 'undefined' ? config : global.config || {};
          const MINORDER = moedaBase 
              ? (configSafe.MINORDER?.[moedaBase] || configSafe.MINORDER?.DEFAULT || 0.001)
              : 0.001;
      
          // 4. Verificação de valor válido
          if (MINORDER <= 0) {
              await global.logger.log(`[${symbolString}] Valor MINORDER inválido: ${MINORDER}`, "ERRO");
              return;
          }
        
        if (!estadoPar.emOperacao || estadoPar.tradesHoje >= config.MAX_TRADES_DIA - 1) return;
        
        const ganhoPosCompra = (estadoPar.precoAtual - estadoPar.ultimaCompra) / estadoPar.ultimaCompra;
        const tempoDesdeCompra = Date.now() - estadoPar.ultimaCompraTimestamp;
        
        if (ganhoPosCompra > 0.01 && tempoDesdeCompra > 60000 && estadoPar.rsi < 60) {
          const qtdAdicional = await this.calcularTamanhoPosicao(simbolo, estadoPar, estadoPar.precoAtual) * 0.5;

          if (qtdAdicional > MINORDER) {
            const preco = estadoPar.precoAtual;
            const podeComprar = await this.verificarCustoBeneficio(simbolo, estadoPar, qtdAdicional, preco);
            if (!podeComprar) {
              await global.logger.log(`[${simbolo}] Compra cancelada: custo/benefício ruim`, 'AVISO');
              return;
            }
            
            await Ordem.executarCompra(simbolo, estadoPar, estadoPar.precoAtual, qtdAdicional, 'PIRAMIDAL');
            
            // Atualizar preço médio
            const custoTotal = (estadoPar.ultimaCompraQtd * estadoPar.ultimaCompra) + (qtdAdicional * estadoPar.precoAtual);
            estadoPar.ultimaCompraQtd += qtdAdicional;
            estadoPar.ultimaCompra = custoTotal / estadoPar.ultimaCompraQtd;
            
            // Atualizar stops
            estadoPar.stopLoss = estadoPar.ultimaCompra - (estadoPar.atr * 1.5);
            estadoPar.takeProfit = this.calcularTakeProfit(estadoPar.ultimaCompra, estadoPar);
          }
        }
      } catch (err) {
        await global.logger.log(`Erro crítico: ${err.message}`, "ERRO");
      }
    }  
  
    static async preverTaxasAvancado(simbolo, qtd, preco) {
      try {
        const url = `${getBinanceBaseUrl()}/api/v3/depth?symbol=${simbolo}&limit=10`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'NodeBot/' + process.version,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        const impactoCompra = this.calcularImpactoMercado(data.asks, qtd);
        const impactoVenda = this.calcularImpactoMercado(data.bids, qtd);

        const spread = (impactoCompra.precoMedio - impactoVenda.precoMedio) / impactoVenda.precoMedio;
        const taxaEstimada = spread + (config.TAXA_TAKER * 2);

        return {
          total: taxaEstimada * qtd * preco,
          spread: spread,
          volume: impactoCompra.volumeTotal,
          taxaPercentual: taxaEstimada * 100
        };

      } catch (err) {
        await global.logger?.log(
          `[${simbolo}] Erro em preverTaxasAvancado: ${err.message}`,
          'ERRO'
        );

        // fallback para algo conservador
        const taxaBase = config.TAXA_TAKER * 2;
        return {
          total: taxaBase * qtd * preco,
          spread: 0.001,
          volume: 100000,
          taxaPercentual: taxaBase * 100
        };
      }
    }

    // MELHORIA: Recuperação extremamente agressiva
    static ativarModoRecuperacaoAgressiva(simbolo, estadoPar) {
      const deficit = (estadoPar.saldoInicialDia * METAS_AGRESSIVAS.META_DIARIA) - estadoPar.lucroDia;
      const horasRestantes = 24 - new Date().getHours();
      const metaHorariaNecessaria = deficit / horasRestantes;
      
      estadoPar.modoRecuperacao = true;
      estadoPar.metaRecuperacao = metaHorariaNecessaria;
      
      // Parâmetros extremamente agressivos para recuperação
      config.RISK_PER_TRADE = 4.0; // 4% de risco por trade
      estrategia.LUCRO_MINIMO = 1.0015; // Lucro mínimo de 0.15%
      estrategia.STOP_LOSS = 0.997; // Stop loss de 0.3%
      
      // Aumentar drasticamente o volume
      config.VOLUME_BASE = 150;
      
      // Reduzir tempo entre operações
      estrategia.ESPERA_ENTRE_OPERACOES = 500;
      
      global.logger.log(
        `[${simbolo}] 🔥 MODO RECUPERAÇÃO AGressIVA ATIVADO! Meta horária: ${(metaHorariaNecessaria*100).toFixed(3)}%`,
        'ALERTA'
      );
    }

    static ativarModoRecuperacao(simbolo) {
      const estadoPar = Estado.obterEstadoPar(simbolo);
      if (!estadoPar || estadoPar.modoRecuperacao) return;
      
      estadoPar.modoRecuperacao = true;
      config.RISK_PER_TRADE = estrategia.RECUPERACAO_RISCO;
      estrategia.LUCRO_MINIMO = estrategia.RECUPERACAO_LUCRO_MIN;
      config.MAX_TRADES_DIA += 5;
      
      estrategia.SCALP_LUCRO_MINIMO = 1.0015;
      estrategia.ESPERA_ENTRE_OPERACOES = 1000;
      
      global.logger.log(
        `[${simbolo}] 🔥 ATIVANDO MODO RECUPERAÇÃO! Risk/Trade: ${config.RISK_PER_TRADE}% | ` +
        `Lucro Mín: ${((estrategia.LUCRO_MINIMO-1)*100).toFixed(3)}%`,
        'ALERTA'
      );
    }

    static desativarModoRecuperacao(simbolo) {
      const estadoPar = Estado.obterEstadoPar(simbolo);
      if (!estadoPar || !estadoPar.modoRecuperacao) return;
      
      estadoPar.modoRecuperacao = false;
      config.RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '1.5');
      estrategia.LUCRO_MINIMO = 1.005;
      config.MAX_TRADES_DIA = parseInt(process.env.MAX_TRADES_DIA || '100');
      
      global.logger.log(
        `[${simbolo}] ✅ DESATIVANDO MODO RECUPERAÇÃO! Risk/Trade: ${config.RISK_PER_TRADE}% | ` +
        `Lucro Mín: ${((estrategia.LUCRO_MINIMO-1)*100).toFixed(3)}%`,
        'ALERTA'
      );
    }

    static async verificarRecuperacaoDrawdown(simbolo) {
      const estadoPar = Estado.obterEstadoPar(simbolo);
      if (!estadoPar) return;
      
      const capitalAtual = (estadoPar.saldos?.USDT || 0) + 
                      ((estadoPar.saldos?.[moedaBase] || 0) * (estadoPar.precoAtual || 0));
      const drawdownDiario = (estadoPar.saldoInicialDia - capitalAtual) / estadoPar.saldoInicialDia;
      
      if (drawdownDiario > estadoPar.drawdownMaximoDia) {
        estadoPar.drawdownMaximoDia = drawdownDiario;
      }
      
      if (drawdownDiario >= config.DRAWDOWN_RECUPERACAO || drawdownDiario >= config.PERDA_DIARIA_MAXIMA) {
        this.ativarModoRecuperacao(simbolo);
      } else if (drawdownDiario <= config.DRAWDOWN_RECUPERACAO / 2) {
        this.desativarModoRecuperacao(simbolo);
      }
    }

    static async reduzirExposicao(simbolo, estadoPar) {
      try {
        const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
        
        // Aplicar apenas se estiver em operação
        if (!estadoPar.emOperacao) return;

        const porcentagemReducao = 0.5; // Reduzir 50% da posição
        const qtdReducao = (estadoPar.saldos?.[moedaBase] || 0) * porcentagemReducao;
        const MINORDER = config.MINORDER[moedaBase];
        
        // Verificar quantidade mínima
        if (qtdReducao > MINORDER) {
          await Ordem.executarVenda(simbolo, estadoPar, estadoPar.precoAtual, null, "REDUÇÃO EXPOSIÇÃO (BAIXA VOL + RECUPERAÇÃO)");
          
          await global.logger.log(
            `[${simbolo}] ♻️ Reduzida exposição em ${porcentagemReducao*100}% ` +
            `(${qtdReducao.toFixed(6)} ${moedaBase})`,
            "AVISO"
          );
          
          // Atualizar stop loss para posição remanescente
          if (estadoPar.saldos?.[moedaBase]  > 0) {
            estadoPar.stopLoss = estadoPar.ultimaCompra * 0.995;
            await global.logger.log(
              `[${simbolo}] 🔁 Stop loss ajustado para ${estadoPar.stopLoss.toFixed(2)}`,
              "INFO"
            );
          }
        } else {
          await global.logger.log(
            `[${simbolo}] Quantidade insuficiente para redução: ` +
            `${qtdReducao.toFixed(6)} ${moedaBase} < ${MINORDER}`,
            "AVISO"
          );
        }
      } catch (err) {
        await global.logger.log(
          `[${simbolo}] ERRO ao reduzir exposição: ${err.message}`,
          "ERRO"
        );
      }
    }

  // Monitorar múltiplos pares simultaneamente
    static async monitorarProtecoesMultiPar() {
      for (const simbolo of paresAtivos) {
        const estadoPar = Estado.obterEstadoPar(simbolo);
        if (!estadoPar) continue;
        
        await this.verificarProtecoes(simbolo, estadoPar, estadoPar.precoAtual);
        
        // Intervalo entre verificações
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    static obterEstadoAnterior(simbolo) {
      if (!global.estados) return null;
      return global.estados[simbolo] || null;
    }

    static calcularImpactoMercado(ordens, quantidade) {
        try {
          if (!ordens || !Array.isArray(ordens) || ordens.length === 0 || quantidade <= 0) {
            return { 
              impactoPreco: 0, 
              precoMedio: 0, 
              volumeTotal: 0,
              precoMaisAlto: 0,
              precoMaisBaixo: 0
            };
          }

          let quantidadeRestante = quantidade;
          let valorTotal = 0;
          let volumeTotal = 0;
          let precoMaisAlto = parseFloat(ordens[0][0]);
          let precoMaisBaixo = parseFloat(ordens[0][0]);

          for (const ordem of ordens) {
            const preco = parseFloat(ordem[0]);
            const volumeOrdem = parseFloat(ordem[1]);
            
            if (quantidadeRestante <= 0) break;

            const quantidadeExecutada = Math.min(quantidadeRestante, volumeOrdem);
            valorTotal += preco * quantidadeExecutada;
            volumeTotal += volumeOrdem;
            quantidadeRestante -= quantidadeExecutada;

            // Atualizar preços extremos
            precoMaisAlto = Math.max(precoMaisAlto, preco);
            precoMaisBaixo = Math.min(precoMaisBaixo, preco);
          }

          const precoMedio = quantidade > 0 ? valorTotal / quantidade : parseFloat(ordens[0][0]);
          const impactoPreco = precoMedio - precoMaisBaixo;

          return {
            impactoPreco,
            precoMedio,
            volumeTotal,
            precoMaisAlto,
            precoMaisBaixo
          };
        } catch (err) {
          return { 
            impactoPreco: 0, 
            precoMedio: 0, 
            volumeTotal: 0,
            precoMaisAlto: 0,
            precoMaisBaixo: 0
          };
        }
    }

    static async obterVolumeRecente(simbolo) {
      try {
        const response = await fetch(`${getBinanceBaseUrl()}/api/v3/ticker/24hr?symbol=${simbolo}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por obterVolumeRecente 1 ${simbolo} <> ${parseFloat(data.quoteVolume)} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%% 
        return parseFloat(data.quoteVolume) || 0;
      } catch (error) {
        console.error(`Erro ao obter volume para ${simbolo}:`, error.message);
        return 0;
      }
    }
}  

  async function obterDadosMercado(simbolo) {
      try {
          console.log(`[BOT] Obtendo dados de mercado para ${simbolo}...`);
          
          // 1. Obter dados de candlestick usando Brian
          const klines = await brian.getKlines(simbolo, '15m', { limit: 100 });
          
          if (!klines || klines.length === 0) {
              throw new Error(`Não foi possível obter dados para ${simbolo}`);
          }
          
          // 2. Extrair preços
          const fechamentos = klines.map(k => k.close);
          
          // 3. Calcular indicadores técnicos
          const precoAtual = fechamentos[fechamentos.length - 1];
          
          // Calcular RSI (implementação simplificada)
          const rsi = await calcularRSI(fechamentos, 14);
          const rsiAtual = rsi[rsi.length - 1];
          
          // Calcular EMAs
          const emaShort = await calcularEMA(fechamentos, 12);
          const emaLong = await calcularEMA(fechamentos, 26);
          
          const emaShortAtual = emaShort[emaShort.length - 1];
          const emaLongAtual = emaLong[emaLong.length - 1];
          
          // Calcular MACD
          const macd = await calcularMACD(fechamentos, 12, 26, 9);
          const macdAtual = {
              histogram: macd.histogram[macd.histogram.length - 1],
              signal: macd.signalLine[macd.signalLine.length - 1],
              macd: macd.macdLine[macd.macdLine.length - 1]
          };
          
          // Calcular volatilidade
          const retornos = [];
          for (let i = 1; i < fechamentos.length; i++) {
              retornos.push((fechamentos[i] - fechamentos[i - 1]) / fechamentos[i - 1]);
          }
          const volatilidade = calcularDesvioPadrao(retornos);
          
          // Volume das últimas 24 horas (aproximação)
          const volumes = klines.map(k => k.volume);
          const volume24h = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length * 24;
          
          // Determinar tendência
          let tendencia = 'NEUTRA';
          if (emaShortAtual > emaLongAtual && precoAtual > emaShortAtual) {
              tendencia = 'ALTA';
          } else if (emaShortAtual < emaLongAtual && precoAtual < emaShortAtual) {
              tendencia = 'BAIXA';
          }
          
          return {
              simbolo,
              precoAtual,
              rsi: rsiAtual,
              emaShort: emaShortAtual,
              emaLong: emaLongAtual,
              macd: macdAtual,
              volatilidade,
              volume24h,
              tendencia,
              timestamp: new Date().toISOString(),
              candles: klines.length
          };
          
      } catch (error) {
          console.error(`[BOT] Erro ao obter dados de mercado para ${simbolo}:`, error);
          
          return {
              simbolo,
              precoAtual: 0,
              rsi: 0,
              emaShort: 0,
              emaLong: 0,
              macd: { histogram: 0, signal: 0, macd: 0 },
              volatilidade: 0,
              volume24h: 0,
              tendencia: 'NEUTRA',
              timestamp: new Date().toISOString(),
              candles: 0,
              erro: error.message
          };
      }
  }

  // Função auxiliar para calcular desvio padrão
  function calcularDesvioPadrao(valores) {
      if (valores.length === 0) return 0;
      
      const media = valores.reduce((sum, val) => sum + val, 0) / valores.length;
      const variancia = valores.reduce((sum, val) => sum + Math.pow(val - media, 2), 0) / valores.length;
      
      return Math.sqrt(variancia);
  }

// ====================== SISTEMA DE SCALPING MULTI-CRYPTO ======================
class Scalping {
  static async verificarOportunidadesRapidas(estadoPar) {
    const simbolo = estadoPar?.simbolo || 'UNKNOWN';
    try {
      // Extrair moeda base do símbolo (ex: BTC de BTCUSDT)
      const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');

      if (!estadoPar?.simbolo) return;
      
      if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA) return;
      if (estadoPar.emOperacao) return this.verificarSaidaScalp(estadoPar);

      const emaShort = Number(estadoPar?.emaShort) || 0;
      const emaLong  = Number(estadoPar?.emaLong)  || 1; // usa 1 pra evitar divisão por 0
      const spread   = emaLong !== 0 ? (emaShort - emaLong) / emaLong : 0;
      const mudancaRapida = this.calcularMomentum(estadoPar, 3) > 0.004;
    
      const condicoesEntrada = (
        spread > 0.002 && 
        estadoPar.rsi > estrategia.SCALP_RSI_MIN && 
        estadoPar.rsi < 65 &&
        (mudancaRapida || Indicadores.volumeAnormal(estadoPar.historicoVolumes)) &&
        estadoPar.volatilidade > estrategia.SCALP_VOL_MIN
      );

      if (!condicoesEntrada) return;
    
      if (!await GerenciamentoRisco.verificarViabilidadeOperacional(estadoPar.simbolo, estadoPar, true)) {
        await global.logger.log(`[${estadoPar.simbolo}] Condições desfavoráveis para scalping`, "AVISO");
        return;
      }
    
      const capitalScalp = estadoPar.saldos?.USDT * 0.08;
      const qtd = capitalScalp / estadoPar.precoAtual;
    
      // Verificação multi-cripto
      if (qtd < config.MINORDER[moedaBase]) {
        await global.logger.log(
          `[${estadoPar.simbolo}] Quantidade abaixo do mínimo: ${qtd} < ${config.MINORDER[moedaBase]} ${moedaBase}`,
          'AVISO'
        );
        return;
      }

      const podeComprar = await GerenciamentoRisco.verificarCustoBeneficio(
        estadoPar.simbolo, 
        estadoPar, 
        qtd, 
        estadoPar.precoAtual
      );
      
      if (!podeComprar) {
        await global.logger.log(`[${estadoPar.simbolo}] Compra cancelada: custo/benefício ruim`, 'AVISO');
        return;
      }

      await Ordem.executarCompra(estadoPar.simbolo, estadoPar, estadoPar.precoAtual, qtd, 'SCALP RÁPIDO');
    
      estadoPar.stopLoss = estadoPar.precoAtual * 0.997;
      estadoPar.takeProfit = estadoPar.precoAtual * estrategia.SCALP_LUCRO_MINIMO;
      estadoPar.ultimaCompraTimestamp = Date.now();
      estadoPar.estrategia = "SCALP"; // Registrar estratégia
    
    } catch (err) {
    await global.logger.log(`[${estadoPar.simbolo || 'UNKNOWN'}] Erro no scalping: (verificarOportunidadesRapidas) ${err.message}`, "ERRO");
    logErroDetalhado(err, 'Erro no scalping: (verificarOportunidadesRapidas)');
    }
  }

  static async oportunidadeSuperRapida(estadoPar) {
    try {
      const simbolo = estadoPar.simbolo;
      const moedaBase = simbolo.replace('USDT', '');
      
      if (estadoPar.tradesHoje >= config.MAX_TRADES_DIA || estadoPar.emOperacao) return;

      const spread = (estadoPar.emaShort - estadoPar.emaLong) / estadoPar.emaLong;
      const volumeAnormal = Indicadores.volumeAnormal(estadoPar.historicoVolumes);
      
      if (spread > 0.0015 && volumeAnormal && estadoPar.rsi < 60) {
        const qtd = (estadoPar.saldos?.USDT * 0.04) / estadoPar.precoAtual;
        
        // Verificação multi-cripto
        if (qtd < config.MINORDER[moedaBase]) {
          await global.logger.log(
            `[${estadoPar.simbolo}] Quantidade abaixo do mínimo: ${qtd} < ${config.MINORDER[moedaBase]} ${moedaBase}`,
            'AVISO'
          );
          return;
        }

        const podeComprar = await GerenciamentoRisco.verificarCustoBeneficio(
          estadoPar.simbolo,
          estadoPar,
          qtd,
          estadoPar.precoAtual
        );
        
        if (!podeComprar) {
          await global.logger.log(`[${estadoPar.simbolo}] Compra cancelada: custo-benefício ruim`, 'AVISO');
          return;
        }
        
        await Ordem.executarCompra(estadoPar.simbolo, estadoPar, estadoPar.precoAtual, qtd, 'SCALP SUPER RÁPIDO');
        
        estadoPar.takeProfit = estadoPar.precoAtual * 1.002;
        estadoPar.stopLoss = estadoPar.precoAtual * 0.9985;
        estadoPar.ultimaCompraTimestamp = Date.now();
        estadoPar.estrategia = "SCALP_SUPER"; // Registrar estratégia
      }
    } catch (err) {
      await global.logger.log(`[${estadoPar.simbolo}] Erro scalping super rápido: ${err.message}`, "ERRO");
    }
  }

  static async verificarSaidaScalp(estadoPar) {
    try {
      // Verificar se é uma operação de scalping
      if (!estadoPar.estrategia || !estadoPar.estrategia.includes("SCALP")) return;
      
      const lucroAtual = (estadoPar.precoAtual - estadoPar.ultimaCompra) / estadoPar.ultimaCompra;
      const tempoAtual = Date.now() - estadoPar.ultimaCompraTimestamp;
      
      const deveSair = (
        lucroAtual >= 0.002 ||
        lucroAtual <= -0.001 ||
        tempoAtual > 180000 // 3 minutos
      );
      
      if (!deveSair) return;
      const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');

      const qtd = estadoPar.saldos?.[moedaBase] || 0;
      
      const podeVender = await GerenciamentoRisco.verificarCustoBeneficio(
        estadoPar.simbolo,
        estadoPar,
        qtd,
        estadoPar.precoAtual
      );
      
      if (!podeVender) {
        await global.logger.log(`[${estadoPar.simbolo}] Venda cancelada: custo-benefício ruim`, 'AVISO');
        return;
      }
      
      await Ordem.executarVenda(estadoPar.simbolo,estadoPar, estadoPar.precoAtual, null, `SCALP SAÍDA ${lucroAtual >= 0 ? 'LUCRO' : 'STOP'}`);
      
    } catch (err) {
      await global.logger.log(`[${estadoPar.simbolo}] Erro saída scalping: ${err.message}`, "ERRO");
    }
  }

  static calcularMomentum(estadoPar, periodos = 3) {
    if (!estadoPar.historicoPrecos || estadoPar.historicoPrecos.length < periodos + 1) return 0;
    
    const precos = estadoPar.historicoPrecos.slice(-periodos - 1);
    const mudancas = [];
    
    for (let i = 1; i < precos.length; i++) {
      mudancas.push((precos[i] - precos[i-1]) / precos[i-1]);
    }
    
    return mudancas.reduce((sum, val) => sum + val, 0) / mudancas.length;
  }

  static async verificarReversao(estadoPar) {
    try {
       const simboloFinal = typeof estadoPar.simbolo === 'string' ? estadoPar.simbolo : estadoPar.simbolo?.simbolo || '';
      const moedaBase = estadoPar[simboloFinal];
      
      if (estadoPar.emOperacao || estadoPar.tradesHoje >= config.MAX_TRADES_DIA) return;
      
      const rsiOversold = estadoPar.rsi < 35;
      const fundoConfirmado = (
        estadoPar.historicoPrecos &&
        estadoPar.historicoPrecos.length >= 3 &&
        estadoPar.historicoPrecos[estadoPar.historicoPrecos.length-1] > estadoPar.historicoPrecos[estadoPar.historicoPrecos.length-2] &&
        estadoPar.historicoPrecos[estadoPar.historicoPrecos.length-2] < estadoPar.historicoPrecos[estadoPar.historicoPrecos.length-3]
      );
      
      if (rsiOversold && fundoConfirmado && estadoPar.volatilidade > 0.01) {
        const qtd = (estadoPar.saldos?.USDT * 0.03) / estadoPar.precoAtual;
        
        // Verificação multi-cripto
        if (qtd < config.MINORDER[moedaBase]) {
          await global.logger.log(
            `[${estadoPar.simbolo}] Quantidade abaixo do mínimo: ${qtd} < ${config.MINORDER[moedaBase]} ${moedaBase}`,
            'AVISO'
          );
          return;
        }

        const podeComprar = await GerenciamentoRisco.verificarCustoBeneficio(
          estadoPar.simbolo,
          estadoPar,
          qtd,
          estadoPar.precoAtual
        );
        
        if (!podeComprar) {
          await global.logger.log(`[${estadoPar.simbolo}] Compra cancelada: custo-benefício ruim`, 'AVISO');
          return;
        }
        
        await Ordem.executarCompra(estadoPar.simbolo, estadoPar, estadoPar.precoAtual, qtd, 'SCALP REVERSÃO');
        
        estadoPar.stopLoss = estadoPar.precoAtual * 0.995;
        estadoPar.takeProfit = estadoPar.precoAtual * 1.005;
        estadoPar.ultimaCompraTimestamp = Date.now();
        estadoPar.estrategia = "SCALP_REVERSAO"; // Registrar estratégia
      }
    } catch (err) {
      await global.logger.log(`[${estadoPar.simbolo}] Erro scalping reversão: ${err.message}`, "ERRO");
    }
  }

  // Monitorar múltiplos pares simultaneamente
  static async monitorarTodosPares(paresAtivos) {
    for (const simbolo of global.paresAtivos) {
      const estadoPar = Estado.obterEstadoPar(simbolo);
      if (!estadoPar) continue;
      
      await this.verificarOportunidadesRapidas(estadoPar);
      await this.oportunidadeSuperRapida(estadoPar);
      await this.verificarReversao(estadoPar);
      await this.verificarSaidaScalp(estadoPar);
      
      // Intervalo entre verificações
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// ====================== IA DE PARAMETRIZAÇÃO DINÂMICA ======================
class IAParametros {
  static modelo = null;
  static ultimaAnalise = {};
  
  static async inicializar() {
    try {
      // Carregar ou criar modelo de IA para parametrização
      this.modelo = new brain.NeuralNetwork();
      
      // Dados de treinamento para parametrização agressiva
      const trainingData = [
        // Padrões de alta volatilidade + baixo progresso → parâmetros ultra-agressivos
        { input: { volatilidade: 0.8, progressoDiario: 0.2, hora: 0.8, volume: 0.7 }, 
          output: { risco: 0.9, lucroMinimo: 0.15, stopLoss: 0.3, volume: 0.9, turbo: 1 } },
        
        // Padrões de mercado estável + bom progresso → parâmetros moderados
        { input: { volatilidade: 0.3, progressoDiario: 0.7, hora: 0.4, volume: 0.5 }, 
          output: { risco: 0.5, lucroMinimo: 0.08, stopLoss: 0.5, volume: 0.6, turbo: 0 } },
          
        // Padrões de recuperação necessária → parâmetros agressivos
        { input: { volatilidade: 0.6, progressoDiario: 0.3, hora: 0.9, volume: 0.8 }, 
          output: { risco: 0.8, lucroMinimo: 0.12, stopLoss: 0.4, volume: 0.8, turbo: 1 } }
      ];
      
      this.modelo.train(trainingData, {
        iterations: 2000,
        errorThresh: 0.005,
        learningRate: 0.3
      });
      
      global.logger.log("✅ IA de parametrização inicializada com sucesso", "INFO");
    } catch (err) {
      global.logger.log(`❌ Erro ao inicializar IA de parametrização: ${err.message}`, "ERRO");
      // Fallback para valores padrão agressivos
      this.modelo = {
        run: () => ({ risco: 0.8, lucroMinimo: 0.1, stopLoss: 0.4, volume: 0.8, turbo: 1 })
      };
    }
  }

  static analisarDesempenho(estadoPar) {
      try {
          const horaAtual = new Date().getHours();
          const metaDiaria = estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO;
          
          const progressoDiario = metaDiaria > 0 
              ? Math.min(1, Math.max(0, estadoPar.lucroDia / metaDiaria))
              : 0;

          // Normalização mais segura dos valores
          const dadosEntrada = {
              volatilidade: Math.min(1, Math.max(0, estadoPar.volatilidade * 10)),
              progressoDiario: progressoDiario,
              hora: horaAtual / 24,
              volume: Math.min(1, Math.max(0, 
                  estadoPar.volume24h / (config.VOLUME_MINIMO[estadoPar.simbolo] || config.VOLUME_MINIMO.DEFAULT)
              ))
          };

          const resultado = this.modelo.run(dadosEntrada);
          
          // Garantir que todos valores estejam dentro de ranges válidos
          const resultadoValidado = {
              risco: Math.max(0, Math.min(1, resultado.risco || 0.5)),
              lucroMinimo: Math.max(0, Math.min(1, resultado.lucroMinimo || 0.1)),
              stopLoss: Math.max(0, Math.min(1, resultado.stopLoss || 0.3)),
              volume: Math.max(0, Math.min(1, resultado.volume || 0.5)),
              turbo: Math.max(0, Math.min(1, resultado.turbo || 0.5))
          };

          this.ultimaAnalise = {
              timestamp: Date.now(),
              dadosEntrada,
              resultado: resultadoValidado,
              interpretacao: this.interpretarResultado(resultadoValidado)
          };

          return resultadoValidado;

      } catch (err) {
          global.logger.log(`❌ Erro na análise de desempenho: ${err.message}`, "ERRO");
          
          // Fallback mais robusto
          return {
              risco: 0.5,
              lucroMinimo: 0.1,
              stopLoss: 0.3,
              volume: 0.5,
              turbo: 0.5
          };
      }
  }
  
  static interpretarResultado(resultado) {
    const interpretacoes = [];
    
    if (resultado.risco > 0.8) interpretacoes.push("RISCO MUITO ALTO");
    if (resultado.lucroMinimo < 0.1) interpretacoes.push("LUCRO MÍNIMO BAIXO");
    if (resultado.turbo > 0.7) interpretacoes.push("TURBO RECOMENDADO");
    
    return interpretacoes.length > 0 ? interpretacoes.join(" | ") : "PARÂMETROS NORMAIS";
  }
  
  static obterParametrosOtimizados(estadoPar) {
    const analise = this.analisarDesempenho(estadoPar);

    console.log('Análise de desempenho:', JSON.stringify(analise, null, 2));

   //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
   console.log(`[PASSO] Passou por obterParametrosOtimizados 1 ${analise.risco} <> ${analise.lucroMinimo} <> ${analise.stopLoss} <> ${analise.volume} <> ${analise.turbo}- logger.iniciado: ${global.logger?.iniciado}`);
   //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
    
    return {
      risco: Math.min(5, Math.max(1, analise.risco * 5)), // Converter para escala 1-5%
      lucroMinimo: 1 + (analise.lucroMinimo / 100),
      stopLoss: 1 - (analise.stopLoss / 100),
      volume: Math.min(200, Math.max(50, analise.volume * 200)),
      ativacaoTurbo: analise.turbo > 0.7
    };
  }
  
  static getRelatorio() {
      // Verificar se a última análise existe e é válida
      if (!this.ultimaAnalise || typeof this.ultimaAnalise !== 'object') {
          return {
              timestamp: null,
              dadosEntrada: {},
              resultado: {},
              interpretacao: "Nenhuma análise disponível",
              status: "ERRO: Análise não disponível"
          };
      }

      // Garantir que todos os campos necessários existam
      const relatorio = {
          timestamp: this.ultimaAnalise.timestamp || Date.now(),
          dadosEntrada: this.ultimaAnalise.dadosEntrada || {},
          resultado: this.ultimaAnalise.resultado || {},
          interpretacao: this.ultimaAnalise.interpretacao || "Interpretação não disponível",
          status: "OK"
      };

      // Validar números para evitar NaN
      if (relatorio.resultado.risco && isNaN(relatorio.resultado.risco)) {
          relatorio.resultado.risco = 0.5; // Valor padrão seguro
          relatorio.interpretacao += " | Risco ajustado para valor padrão";
      }

      return relatorio;
  }

  static formatarRelatorioParaLog(relatorio) {
    if (!relatorio.resultado || Object.keys(relatorio.resultado).length === 0) {
        return relatorio.interpretacao || "Nenhum dado disponível";
    }
    
    const { risco, lucroMinimo, stopLoss, volume, turbo } = relatorio.resultado;
    return `${relatorio.interpretacao} | Risco: ${(risco * 100).toFixed(1)}% | ` +
          `Lucro Min: ${((lucroMinimo - 1) * 100).toFixed(2)}% | ` +
          `Stop: ${(stopLoss * 100).toFixed(2)}% | ` +
          `Volume: ${(volume * 100).toFixed(1)}% | ` +
          `Turbo: ${(turbo * 100).toFixed(0)}%`;
  }
}

// Inicializar assim que possível
IAParametros.inicializar();

// ====================== CONTROLE DE QUALIDADE ======================
  class ControladorQualidade {
    static metricas = {
      horarias: [],
      diarias: [],
      mensais: []
    };
    
    static verificarMetas(estadoPar) {
      const horaAtual = new Date().getHours();
      const lucroHorario = estadoPar.lucroHorario || 0;
      const metaHoraria = estadoPar.metaHoraria || METAS_AGRESSIVAS.HORARIA;
      
      // Registrar métrica horária
      this.metricas.horarias.push({
        timestamp: Date.now(),
        simbolo: estadoPar.simbolo,
        lucro: lucroHorario,
        meta: metaHoraria,
        atingiuMeta: lucroHorario >= metaHoraria
      });

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      const ultimoRegistro = this.metricas.horarias[this.metricas.horarias.length - 1];
      console.log(`[PASSO] Passou por verificarMetas 1 =>`, ultimoRegistro, "- logger.iniciado:", global.logger?.iniciado);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
      
      // Acionar alertas se não atingir meta
      if (lucroHorario < metaHoraria * 0.7) {
        this.acionarAlerta(
          estadoPar.simbolo, 
          `Meta horária em risco: ${(lucroHorario*100).toFixed(2)}% < ${(metaHoraria*100).toFixed(2)}%`
        );
        
        // Ativar turbo se necessário
        if (lucroHorario < metaHoraria * 0.5) {
            try {
                GerenciamentoRisco.ativarModoTurboComIA(estadoPar.simbolo, estadoPar);
            } catch (err) {
                console.error('Falha ao ativar turbo com IA:', err);
                // Fallback para turbo regular
                GerenciamentoRisco.ativarModoTurbo(estadoPar.simbolo, estadoPar);
            }
        }
      }
      
      // Relatório diário automático
      if (horaAtual === 23) {
        this.gerarRelatorioDiario();
      }
    }
    
    static gerarRelatorioDiario() {
      const relatorio = {
        timestamp: Date.now(),
        resumo: {
          totalTrades: 0,
          tradesLucro: 0,
          tradesPrejuizo: 0,
          lucroTotal: 0,
          metaAtingida: false
        },
        detalhes: []
      };
      
      for (const par of global.PARES_ATIVOS) {
        const estado = global.estados[par];
        const lucroPar = estado.lucroDia || 0;
        const metaPar = estado.saldoInicialDia * METAS_AGRESSIVAS.DIARIA;
        
        relatorio.detalhes.push({
          simbolo: par,
          lucro: lucroPar,
          meta: metaPar,
          percentual: (lucroPar / estado.saldoInicialDia) * 100,
          trades: estado.tradesHoje || 0
        });
        
        relatorio.resumo.totalTrades += estado.tradesHoje || 0;
        relatorio.resumo.lucroTotal += lucroPar;
      }
      
      relatorio.resumo.metaAtingida = relatorio.resumo.lucroTotal >= 
        (global.estados[global.PARES_ATIVOS[0]].saldoInicialDia * METAS_AGRESSIVAS.DIARIA);
      
      relatorio.resumo.performancePercent = (relatorio.resumo.lucroTotal / 
        global.estados[global.PARES_ATIVOS[0]].saldoInicialDia) * 100;
      
      // Salvar relatório
      this.salvarRelatorio(relatorio);
      
      return relatorio;
    }
    
    static acionarAlerta(simbolo, mensagem) {
      global.logger.log(`🚨 ALERTA [${simbolo}]: ${mensagem}`, "ALERTA");
      
      // Aqui você pode adicionar notificações por e-mail, SMS, etc.
    }
    
    static salvarRelatorio(relatorio) {
      const fs = {};
      const caminho = path.join(__dirname, 'LOGS', 'relatorios', `relatorio_${Date.now()}.json`);

      // Garante que a pasta existe antes de salvar
      fs.mkdirSync(path.dirname(caminho), { recursive: true });

      fs.writeFileSync(caminho, JSON.stringify(relatorio, null, 2), 'utf-8');
      console.log(chalk.bgGreen.white(`Relatório salvo em: ${caminho}`));
      process.exit(0)
    }
  }  

// ====================== INTERFACE ======================
class Interface {
  static mostrarStatusPar(simbolo, estadoPar, alerta = '') {
    const progresso = GerenciamentoRisco.calcularProgressoHorario(estadoPar);
    const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');

    if (!estadoPar || typeof estadoPar !== 'object') {
      console.log(chalk.bgRed.white(`[ERRO CRÍTICO] EstadoPar inválido para ${simbolo}`));
      return; // Saída segura
    }
    if (!estadoPar || !estadoPar.saldos) {
      console.error(chalk.bgRed.white(`[ERRO CRÍTICO] EstadoPar inválido ou não inicializado para ${simbolo}`));
      return;
    }
    if (!estadoPar.simbolo) {
      console.error(chalk.bgRed.white(`[ERRO CRÍTICO] Símbolo não definido no estado do par ${simbolo}`));
      return;
    }
  try {
//      console.clear();

      // 1. Funções de formatação seguras
     const safeFormatarTimestamp = (timestamp) => {
     try {
       if (!timestamp) return 'Nunca';
    
       // Se já for uma string formatada, retorne direto
       if (typeof timestamp === 'string' && timestamp.includes(':')) {
         return timestamp;
       }
    
       // Se for ISO string ou timestamp numérico
       const date = new Date(timestamp);
    
       if (isNaN(date)) return 'Formato inválido';
    
       return date.toLocaleString('pt-BR', {
        timeZone: config.TIMEZONE,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
       });
     } catch {
      return 'Erro na formatação';
     }
    };

      const formatarValor = (valor) => {
        if (typeof valor !== 'number' || isNaN(valor)) return '0.00';
        return valor.toLocaleString('pt-BR', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        });
      };

      const formatarMoeda = (valor, decimais = 6) => {
        if (typeof valor !== 'number' || isNaN(valor)) return '0.00';
        return valor.toLocaleString('pt-BR', { 
          minimumFractionDigits: decimais, 
          maximumFractionDigits: decimais 
        });
      };

      // 2. Obter símbolo de forma segura
      const simboloStr = global.obterSimboloString(simbolo, estadoPar) || 'UNKNOWN';
      
      // 3. Criar objetos seguros com fallbacks
      const safeEstado = estadoPar || {};
      const safeHealthCheck = safeEstado.healthCheck || {
        ultimaConexao: null,
        totalErros: 0,
        totalTaxas: 0,
        ordensRejeitadas: 0
      };

      // 4. Obter dados formatados
      const inicioExecucao = safeFormatarTimestamp(safeEstado.inicioExecucao);
      const ultimaConexao = safeFormatarTimestamp(safeHealthCheck.ultimaConexao);

      console.log(chalk.bold.cyan(`============================== [${simbolo}] ==============================`));

      // MODOS E INFORMAÇÕES GERAIS
      const modo = config.SIMULA ? 'SIMULAÇÃO' : config.USE_TESTNET ? 'TESTNET' : 'MAINNET';
      const corModo = config.SIMULA ? chalk.yellow : config.USE_TESTNET ? chalk.blue : chalk.green;

      console.log(chalk.gray(`⏱️ Início: ${inicioExecucao} | Modo: ${corModo(modo)} | Trades hoje: ${estadoPar.tradesHoje || 0}/${config.MAX_TRADES_DIA}`));
      console.log(chalk.gray(`⏱️ Últ. conexão: ${ultimaConexao} | Erros: ${safeHealthCheck.totalErros} | Taxas acumuladas: ${formatarValor(safeHealthCheck.totalTaxas)} USDT`));

      // 2. SALDOS E LUCROS
      console.log(chalk.bold.cyan('=============================== SALDOS ==============================='));
      const saldoCrypto = estadoPar.saldos?.[moedaBase] || 0;
      const valorCrypto = saldoCrypto * estadoPar.precoAtual;
      const total = estadoPar.saldos?.USDT + valorCrypto;

      console.log(chalk.green(`💵 USDT: ${formatarValor(estadoPar.saldos?.USDT)} | ${moedaBase}: ${formatarMoeda(saldoCrypto)} (${formatarValor(valorCrypto)}) | TOTAL: ${formatarValor(total)}`));

      const lucroLiquido = estadoPar.lucroAcumulado || 0;
      const percLiquido = estadoPar.saldoInicialDia > 0 ? 
        ((lucroLiquido / estadoPar.saldoInicialDia) * 100).toFixed(2) : '0.00';
      
      const corLucro = lucroLiquido >= 0 ? chalk.green : chalk.red;
      console.log(chalk.green(`💰 Lucro acumulado: ${formatarValor(estadoPar.lucroAcumulado || 0)} USDT `) +
        corLucro(`(Líquido: ${formatarValor(lucroLiquido)} | ${percLiquido}%)`));

      // 3. METAS E DESEMPENHO
      const progressoDia = estadoPar.saldoInicialDia > 0 ?
        ((estadoPar.lucroAcumulado || 0) / (estadoPar.saldoInicialDia * config.LUCRO_DIARIO_ALVO)) * 100 : 0;
      
      console.log(chalk.green(`🎯 Progresso diário: ${progressoDia.toFixed(2)}% | Meta: ${(config.LUCRO_DIARIO_ALVO * 100).toFixed(2)}%`));
      console.log(chalk.magenta(`⏳ Meta/hora: ${formatarValor(estadoPar.metaHoraria || 0)} USDT`));

      const progressoHorario = GerenciamentoRisco.calcularProgressoHorario(estadoPar);
      const corProgresso = progressoHorario >= 1 ? chalk.green : 
                          progressoHorario >= 0.7 ? chalk.yellow : chalk.red;
    
      console.log(corProgresso(`📊 Progresso horário: ${(progressoHorario * 100).toFixed(2)}%`));

      // 4. PREÇOS E OPERAÇÕES
      console.log(chalk.bold.cyan('============================== OPERAÇÃO ============================='));
      
      const corAtual = estadoPar.precoAtual >= estadoPar.precoRef ? chalk.green : chalk.yellow;
      const corRef = chalk.green;
      const corCompra = chalk.bgGreen.white;
      const corVenda = chalk.bgRed.white;
      
      const compraInfo = estadoPar.ultimaCompra
        ? `${formatarValor(estadoPar.ultimaCompra)} (${formatarMoeda(estadoPar.ultimaCompraQtd)} ${moedaBase})`
        : '--';
        
      const vendaInfo = estadoPar.ultimaVenda
        ? `${formatarValor(estadoPar.ultimaVenda)} (${formatarMoeda(estadoPar.ultimaVendaQtd)} ${moedaBase})`
        : '--';
      
      const variacao = estadoPar.precoInicial
         ? ((estadoPar.precoAtual - estadoPar.precoInicial) / estadoPar.precoInicial * 100).toFixed(2)
         : '0';
      
      const drawdown = estadoPar.precoRef > 0
         ? ((estadoPar.precoRef - estadoPar.precoAtual) / estadoPar.precoRef * 100).toFixed(2)
         : '0';
      
      console.log(
         `${corAtual(`📈 Atual: ${formatarValor(estadoPar.precoAtual)}`)} | ` +
         `${corRef(`Ref: ${formatarValor(estadoPar.precoRef)}`)} | ` +
         `${corCompra(`Compra: ${compraInfo}`)}`
      );
      
      console.log(
         chalk.yellow(`📉 Variação: ${variacao}% | Drawdown: ${drawdown}% | `) +
         corVenda(`Venda: ${vendaInfo}`)
      );

      // 5. INDICADORES TÉCNICOS
      console.log(chalk.bold.cyan('============================ INDICADORES ============================'));
      
      // RSI
      const corRSI = estadoPar.rsi < 30 ? chalk.blue : estadoPar.rsi > 70 ? chalk.red : chalk.yellow;
      console.log(`${corRSI(`📊 RSI: ${estadoPar.rsi?.toFixed(2) || 0}`)}`);
      
      // MACD
      const macd = estadoPar.macd || {};
      const valorMACD = typeof macd.macd === "number" ? macd.macd.toFixed(2) : "0.00";
      const valorSignal = typeof macd.signal === "number" ? macd.signal.toFixed(2) : "0.00";
      const valorHist = typeof macd.histogram === "number" ? macd.histogram.toFixed(2) : "0.00";
      const corMACD = macd.histogram > 0 ? chalk.green : chalk.red;
      console.log(`${corMACD(`📈 MACD: ${valorMACD} (S: ${valorSignal} | H: ${valorHist})`)}`);

      // EMA e ATR
      const valorEMA9 = typeof estadoPar.emaShort === "number" ? estadoPar.emaShort.toFixed(2) : "0.00";
      const valorEMA21 = typeof estadoPar.emaLong === "number" ? estadoPar.emaLong.toFixed(2) : "0.00";
      const valorATR = typeof estadoPar.atr === "number" ? estadoPar.atr.toFixed(2) : "0.00";
      console.log(`EMA9: ${valorEMA9} | EMA21: ${valorEMA21} | ATR: ${valorATR}`);
      
      // Status da operação
      const statusOperacao = estadoPar.emOperacao ? chalk.bgGreen.black(' OPERANDO ') : chalk.bgRed.black(' AGUARDANDO ');
      console.log(`📉 Volatilidade: ${((estadoPar.volatilidade || 0) * 100).toFixed(2)}% | Tendência: ${estadoPar.tendencia || 'NEUTRA'} | ${statusOperacao}`);

      // 6. GERENCIAMENTO DE RISCO
      console.log(chalk.bold.cyan('=============================== PROTEÇÕES ==============================='));
      console.log(`🛑 Stop Móvel: ${estadoPar.stopMovel ? formatarValor(estadoPar.stopMovel) : '--'}`);
      
      if (estadoPar.modoRecuperacao) {
        console.log(chalk.bgRed.white('⚠️ MODO RECUPERAÇÃO ATIVO! '));
      }

      // 7. EFICIÊNCIA E ALERTAS
      console.log(chalk.bold.cyan('============================ EFICIÊNCIA ============================'));
      const tradesValidos = estadoPar.performanceDiaria?.tradesValidos || 0;
      const tradesTotais = estadoPar.tradesHoje || 1;
      const eficiencia = tradesValidos > 0 ? (tradesValidos / tradesTotais * 100) : 0;
      
      console.log(`📈 Eficiência: ${eficiencia.toFixed(1)}% | ` +
                  `Win Rate: ${(estadoPar.performanceStats?.winRate || 0).toFixed(1)}%`);
      
      console.log(chalk.bold.cyan('=============================== ALERTA ==============================='));
      if (alerta) {
        console.log('\n' + chalk.yellow(alerta) + '\n');
      } else {
        console.log(chalk.gray(' Nenhum alerta no momento '));
      }

      console.log(chalk.bold.cyan('===================================================================='));
    } catch (err) {
      console.error(chalk.red('Erro ao atualizar interface:'), err);
    }
  }
}

    // Função auxiliar para decidir se usa TESTNET ou MAINNET
    function getBinanceBaseUrl() {
        return process.env.USE_TESTNET === "true"
            ? "https://testnet.binance.vision"
            : "https://api.binance.com";
    }

// ====================== CONEXÃO API ======================
class ConexaoAPI {
  static async obterVolumeComFallback(simbolo, estado = null, tentativa = 0) {
    const MAX_TENTATIVAS = 10;
    try {
        // Simulação de obtenção de dados reais
        let volume = await this.obterVolumeDaAPI(simbolo);
        // Validação adicional
        if (typeof volume !== 'number' || isNaN(volume) || volume <= 0) {
            throw new Error(`Volume inválido: ${volume}`);
        }
        // Atualiza estado se disponível
        if (estado) {
            estado.volume24h = volume;
            estado.healthCheck.ultimoVolumeValido = new Date().toISOString();
        }
        
        return volume;
    } catch (erro) {
        // 4. Tentar fallback após erro
        try {
            // 5. Log detalhado
            await global.logger.log(
                `[${simbolo}] Erro volume (tentativa ${tentativa+1}/${MAX_TENTATIVAS}): ${erro.message}`,
                "AVISO"
            );
            
            // 6. Tentar fonte alternativa
            if (tentativa < MAX_TENTATIVAS) {
                return this.obterVolumeComFallback(simbolo, estado, tentativa + 1);
            }
            
            // 7. Fallback para dados simulados
            const volumeSimulado = this.obterVolumeSimulado(simbolo, estado);
            await global.logger.log(
                `[${simbolo}] Usando volume simulado: ${volumeSimulado}`,
                "AVISO"
            );
            
            if (estado) {
                estado.volume24h = volumeSimulado;
                estado.healthCheck.volumeSimulado = true;
            }
            
            return volumeSimulado;
            
        } catch (fallbackError) {
            // 8. Fallback extremo
            const fallback = 100000; // Valor padrão de emergência
            await global.logger.log(
                `[${simbolo}] ERRO CRÍTICO NO FALLBACK: ${fallbackError.message} | Usando ${fallback}`,
                "ERRO"
            );
            
            if (estado) {
                estado.volume24h = fallback;
            }
            
            return fallback;
        }
    }
}

    static async obterVolumeDaAPI(simbolo) {
      try {
        const url = `${getBinanceBaseUrl()}/api/v3/ticker/24hr?symbol=${simbolo}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'NodeBot/' + process.version,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        return parseFloat(data.volume) || 0;

      } catch (err) {
        await global.logger?.log(
          `[${simbolo}] Erro em obterVolumeDaAPI: ${err.message}`,
          'ERRO'
        );
        return 0; // fallback seguro
      }
    }


    static obterVolumeSimulado(simbolo, estado) {
        // Lógica baseada no histórico ou estado
        if (estado?.historicoVolumes?.length > 0) {
            return estado.historicoVolumes.reduce((a, b) => a + b, 0) / estado.historicoVolumes.length;
        }
    
        // Fallback baseado no símbolo
        const volumesPadrao = {
            'BTCUSDT': 25000,
            'ETHUSDT': 15000,
            'SOLUSDT': 5000
        };
    
        return volumesPadrao[simbolo] || 10000;
    }

 static async obterVolume(simbolo = 'BTCUSDT', tentativa = 0) {
  const TIMEOUT = 8000; // 8 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const url = `${getBinanceBaseUrl()}/api/v3/ticker/24hr?symbol=${simbolo}`;
    const options = {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NodeBot/VolumeMonitor',
        'Accept': 'application/json'
      }
    };

    const res = await fetch(url, options);
    clearTimeout(timeoutId);

    if (!res.ok) {
      // Tratar erros HTTP específicos
      if (res.status === 429) {
        await global.logger.log(`[${simbolo}] Rate limit excedido ao obter volume`, 'AVISO');
        await new Promise(r => setTimeout(r, 5000)); // Espera 5 segundos
        return this.obterVolume(simbolo, tentativa + 1);
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    
    // Validação robusta dos dados
    if (!data || typeof data.quoteVolume === 'undefined') {
      throw new Error('Resposta da API incompleta');
    }
    
    const volume = parseFloat(data.quoteVolume);
    
    if (isNaN(volume)) {
      throw new Error(`Volume inválido: ${data.quoteVolume}`);
    }
    
    // Verificação de volume mínimo (evitar valores absurdamente baixos)
    if (volume < 1000) {
      await global.logger.log(`[${simbolo}] Volume suspeitamente baixo: ${volume}`, 'AVISO');
      return 0;
    }

    return volume;
    
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Classificação de erros
    const errorType = err.name === 'AbortError' ? 'TIMEOUT' : 
                     err.message.includes('ECONN') ? 'CONNECTION' : 
                     'API_ERROR';
    
    if (tentativa < 3) {
      const delay = Math.pow(2, tentativa) * 1000 + Math.random() * 1000;
      await global.logger.log(
        `[${simbolo}] Tentativa ${tentativa+1}/3 | ${errorType}: ${err.message} - Nova tentativa em ${delay/1000}s`,
        'AVISO'
      );
      
      await new Promise(r => setTimeout(r, delay));
      return this.obterVolume(simbolo, tentativa + 1);
    } else {
      await global.logger.log(
        `[${simbolo}] Falha após 3 tentativas | Último erro: ${errorType}: ${err.message}`,
        'ERRO'
      );
      return 0;
    }
   }
  }

    static async obterOrdemBook(simbolo, limite = 5) {
      try {
        const url = `${getBinanceBaseUrl()}/api/v3/depth?symbol=${simbolo}&limit=${limite}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'NodeBot/' + process.version,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();

      } catch (err) {
        await global.logger.log(`[${simbolo}] Erro no order book: ${err.message}`, 'AVISO');
        return { bids: [], asks: [] };
      }
    }


    static async obterSaldoConta(estadoPar) {
      try {
        if (config.SIMULA) return estadoPar.saldos;

        const timestamp = Date.now();
        const query = `timestamp=${timestamp}`;
        const signature = crypto.createHmac('sha256', config.API_SECRET).update(query).digest('hex');

        const url = `${getBinanceBaseUrl()}/api/v3/account?${query}&signature=${signature}`;
        const res = await fetch(url, {
          headers: { 'X-MBX-APIKEY': config.API_KEY }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();
        estadoPar.healthCheck.ultimaConexao = new Date().toISOString();

        const saldos = {};
        data.balances.forEach(b => {
          saldos[b.asset] = parseFloat(b.free) + parseFloat(b.locked);
        });

        return saldos;

      } catch (err) {
        await global.logger.log(`Erro ao obter saldos: ${err.message}`, 'ERRO');
        return estadoPar.saldos || {};
      }
    }


    static async verificarConexao() {
        try {
            const start = Date.now();
            await fetch(`${getBinanceBaseUrl()}/api/v3/ping`);
            return Date.now() - start;
        } catch {
            return -1;
        }
    }

    static async fonteAlternativaPreco(simbolo) {
        try {
            const coinId = {
                BTCUSDT: 'bitcoin',
                ETHUSDT: 'ethereum',
                SOLUSDT: 'solana'
            }[simbolo] || 'bitcoin';
            
            const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
            const data = await res.json();
            return data[coinId]?.usd || 0;
        } catch {
            return 0;
        }
    }

  static async modoOffline(simbolo, estadoAtual) {
      return {
          ...estadoAtual,
          precoAtual: estadoAtual.precoAtual * (1 + (Math.random() * 0.02 - 0.01)),
          volume24h: estadoAtual.volume24h * 0.8,
          volumeAtual: estadoAtual.volumeAtual * 0.7,
          statusConexao: 'OFFLINE'
      };
    }

  static async obterPrecoAtual(simbolo, tentativa = 0) {
    const MAX_TENTATIVAS = 3; // Reduzindo para 3 tentativas para ser mais rápido
    const TIMEOUT = 5000; // Timeout de 5 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        // ✅ lê do dotenv (string → boolean)
        const isTestnet = process.env.USE_TESTNET === "true";

        // base URL dinâmica
        const url = `${getBinanceBaseUrl()}/api/v3/ticker/price?symbol=${simbolo}`;

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'NodeBot/' + process.version,
                'Accept': 'application/json'
            }
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const price = parseFloat(data.price);
        
        // Validação robusta
        if (typeof price !== 'number' || isNaN(price) || price <= 0) {
            throw new Error(`Preço inválido: ${data.price}`);
        }

        const agora = new Date().toISOString();

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por obterPrecoAtual() ${price}  <>  ${agora} <>  ${tentativa}- logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        // Retornar objeto com propriedades consistentes
        return { 
            price: price,
            ultimaConexao: agora
        };
   
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Tentar fonte alternativa na última tentativa
      if (tentativa >= MAX_TENTATIVAS - 1) {
        try {
          const precoAlternativo = await this.obterPrecoAlternativo(simbolo);
          await global.logger.log(
            `[${simbolo}] Usando fonte alternativa: ${precoAlternativo}`,
            'AVISO'
          );
          return precoAlternativo;
        } catch (altErr) {
          await global.logger.log(
            `[${simbolo}] Falha em fonte alternativa: ${altErr.message}`,
            'ERRO'
          );
        }
      }
      
     if (tentativa < MAX_TENTATIVAS) {
        const delay = 2000 * Math.pow(2, tentativa); // Backoff exponencial
        await global.logger.log(
          `[${simbolo}] Tentativa ${tentativa + 1}/${MAX_TENTATIVAS} | Erro: ${err.message} | Nova tentativa em ${delay/1000}s`,
          'AVISO'
        );
        
        await new Promise(r => setTimeout(r, delay));
        return this.obterPrecoAtual(simbolo, tentativa + 1);
      }
      
      throw new Error(`[${simbolo}] Falha após ${MAX_TENTATIVAS} tentativas: ${err.message}`);
    }
 }

  static async obterPrecoAlternativo(simbolo = 'BTCUSDT', tentativa = 0) {
  const MAX_TENTATIVAS = 10;
  const TIMEOUT = 7000;
  
  try {
    // Mapeamento com fallback
    const coinMapping = {
      BTCUSDT: 'bitcoin',
      ETHUSDT: 'ethereum',
      SOLUSDT: 'solana',
      default: 'bitcoin' // ✅ Adicionado fallback
    };
    
    const coinId = coinMapping[simbolo] || coinMapping.default;
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CryptoBot/PriceMonitor',
        'Accept': 'application/json'
      },
      timeout: TIMEOUT // ✅ Adicionado timeout extra
    }).finally(() => clearTimeout(timeoutId)); // ✅ Limpeza garantida
    
    // Tratamento de status HTTP
    if (!res.ok) {
      // Tratamento específico para rate limit
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After')) || 3;
        await global.logger.log(`[${simbolo}] Rate limit CoinGecko. Nova tentativa em ${retryAfter}s`, 'AVISO');
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        return this.obterPrecoAlternativo(simbolo, tentativa + 1);
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    // Validação robusta da resposta
    if (!data || typeof data !== 'object' || 
        !data[coinId] || typeof data[coinId].usd !== 'number' ||
        isNaN(data[coinId].usd)) {
      throw new Error('Resposta estruturalmente inválida da API');
    }
    
    const price = data[coinId].usd;
    
    // Validação de faixa de preço
    const minPrice = 0.01;
    const maxPrice = simbolo === 'BTCUSDT' ? 1000000 : 
                    simbolo === 'ETHUSDT' ? 10000 : 
                    simbolo === 'SOLUSDT' ? 1000 : 500;
    
    if (price < minPrice || price > maxPrice) {
      throw new Error(`Preço fora da faixa esperada: ${price}`);
    }
    
    return price;
    
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (tentativa < 3) {
      const delay = 2000 * (tentativa + 1);
      await global.logger.log(
        `[${simbolo}] Tentativa ${tentativa + 1}/3 | Erro preço alternativo: ${err.message} - Nova tentativa em ${delay/1000}s`,
        'AVISO'
      );
      
      await new Promise(r => setTimeout(r, delay));
      return this.obterPrecoAlternativo(simbolo, tentativa + 1);
    } else {
      await global.logger.log(
        `[${simbolo}] Falha ao obter preço alternativo após 3 tentativas: ${err.message}`,
        'ERRO'
      );
      return null;
    }
  }
}

  static async obterSaldo(ativo, estadoPar = null, tentativa = 0) {
    const TIMEOUT = 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
  try {
      // Modo simulação - usar valores das variáveis de ambiente
      if (config.SIMULA) {
        // Garantir que estadoPar.saldos existe
        if (!estadoPar?.saldos) {
          estadoPar.saldos = {};
        }
        
        // Garantir que o saldo USDT está inicializado (apenas se for o primeiro acesso)
        if (estadoPar.saldos.USDT === undefined) {
          estadoPar.saldos.USDT = config.SALDO_INICIAL_USDT || 1000;
        }
        
        // Se o saldo do ativo específico não existe, inicializar com valor padrão
        if (estadoPar.saldos[ativo] === undefined) {
          estadoPar.saldos[ativo] = config[`SALDO_INICIAL_${ativo}`] || 0;
        }
        
        return estadoPar.saldos[ativo];
      }

      // Modos TESTNET e REAL - obter saldo real da API da Binance
      const timestamp = Date.now();
      const recvWindow = 10000;
      
      // Parâmetros de consulta
      const queryParams = new URLSearchParams({
        timestamp: timestamp.toString(),
        recvWindow: recvWindow.toString()
      });
      
      // Assinatura HMAC
      const signature = crypto.createHmac('sha256', config.API_SECRET)
        .update(queryParams.toString())
        .digest('hex');
      
      queryParams.append('signature', signature);
      
      const url = `${getBinanceBaseUrl()}/api/v3/account?${queryParams.toString()}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 
          'X-MBX-APIKEY': config.API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        // Tratar rate limit específico
        if (res.status === 429 && tentativa < 3) {
          const retryAfter = res.headers.get('Retry-After') || 5;
          await global.logger.log(`[${ativo}] Rate limit, nova tentativa em ${retryAfter}s`, 'AVISO');
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          return this.obterSaldo(ativo, estadoPar, tentativa + 1);
        }
        
        // Tentar parsear erro da Binance
        let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const errorData = await res.json();
          errorMsg += ` | ${errorData.msg || JSON.stringify(errorData)}`;
        } catch (parseError) {
          errorMsg += ` | Erro ao parsear resposta: ${parseError.message}`;
        }
        
        throw new Error(errorMsg);
      }
      
      const data = await res.json();
      
      // Validar resposta
      if (!Array.isArray(data.balances)) {
        throw new Error('Resposta inválida da API');
      }
      
      const saldoInfo = data.balances.find(b => b.asset === ativo);
      const saldo = saldoInfo ? parseFloat(saldoInfo.free) + parseFloat(saldoInfo.locked) : 0;
      
      // Atualizar estado se disponível
      if (estadoPar) {
        // Garante que saldos é um objeto válido
        if (typeof estadoPar.saldos !== 'object' || estadoPar.saldos === null) {
          estadoPar.saldos = {};
        }
    
        // Atualiza apenas se saldo for numérico válido
        if (typeof saldo === 'number' && !isNaN(saldo)) {
          estadoPar.saldos[ativo] = saldo;
        } else {
          console.error(`Valor de saldo inválido para ${ativo}:`, saldo);
        }
      }
      
      return saldo;
      
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Classificação de erros
      const errorType = err.name === 'AbortError' ? 'TIMEOUT' : 
                      err.message.includes('ECONN') ? 'CONNECTION' : 
                      'API_ERROR';
      
      if (tentativa < 3) {
        const delay = Math.pow(2, tentativa) * 2000;
        await global.logger.log(
          `[${ativo}] Tentativa ${tentativa + 1}/3 | ${errorType}: ${err.message} - Nova tentativa em ${delay/1000}s`,
          'AVISO'
        );
        
        await new Promise(r => setTimeout(r, delay));
        return this.obterSaldo(ativo, estadoPar, tentativa + 1);
      } else {
        await global.logger.log(
          `[${ativo}] Falha após 3 tentativas | Último erro: ${errorType}: ${err.message}`,
          'ERRO'
        );
        
        // Fallback: usar saldo do estadoPar se disponível (apenas para SIMULA)
        if (config.SIMULA && estadoPar && estadoPar.saldos && estadoPar.saldos[ativo] !== undefined) {
          return estadoPar.saldos[ativo];
        }
        
        return 0;
      }
    }
  }
   static async obterTicker(par) {
    try {
      const response = await fetch(`${getBinanceBaseUrl()}/api/v3/ticker/price?symbol=${par}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
    console.error(`[ConexaoAPI] Erro ao obter ticker para ${par}: ${err.message}`);
    
    // Adicione informações úteis para debug
    console.log(`URL utilizada: ${getBinanceBaseUrl()}/api/v3/ticker/price?symbol=${par}`);
    console.log(`Modo: ${process.env.USE_TESTNET === "true" ? "TESTNET" : "MAINNET"}`);
    
    throw err;
    }
  }

  static async obterKlines(par, intervalo = '1m', limite = 100) {
    try {
      const url = `${getBinanceBaseUrl()}/api/v3/klines?symbol=${par}&interval=${intervalo}&limit=${limite}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error(`[ConexaoAPI] Erro ao obter klines para ${par}: ${err.message}`);
      throw err;
    }
  }

static async obterVolume(simbolo = 'BTCUSDT', tentativa = 0) {
  const MAX_TENTATIVAS = 10;
  const TIMEOUT = 10000; // 10 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
  
  try {
    // Verificar se estamos usando testnet ou mainnet
    const isTestnet = process.env.USE_TESTNET === "true";
    const baseUrl = getBinanceBaseUrl();
    
    let endpoints;
    
    if (isTestnet) {
      // Para testnet, usar apenas o endpoint principal
      endpoints = [`${baseUrl}/api/v3/ticker/24hr?symbol=${simbolo}`];
    } else {
      // Para mainnet, usar múltiplos endpoints para balanceamento de carga
      endpoints = [
        `${baseUrl}/api/v3/ticker/24hr?symbol=${simbolo}`,
        `https://api1.binance.com/api/v3/ticker/24hr?symbol=${simbolo}`,
        `https://api2.binance.com/api/v3/ticker/24hr?symbol=${simbolo}`,
        `https://api3.binance.com/api/v3/ticker/24hr?symbol=${simbolo}`
      ];
    }
    
    // Seleção aleatória de endpoint
    const randomIndex = Math.floor(Math.random() * endpoints.length);
    const url = endpoints[randomIndex];
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CryptoBot/VolumeFetcher',
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      if (res.status === 429 && tentativa < MAX_TENTATIVAS) {
        const retryAfter = res.headers.get('Retry-After') || 3;
        await global.logger.log(`[${simbolo}] Rate limit, nova tentativa em ${retryAfter}s`, 'AVISO');
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        return this.obterVolume(simbolo, tentativa + 1);
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    // Validação robusta
    if (!data || typeof data.quoteVolume === 'undefined') {
      throw new Error('Resposta inválida da API');
    }
    
    const volume = parseFloat(data.quoteVolume);
    
    if (isNaN(volume)) {
      throw new Error(`Volume inválido: ${data.quoteVolume}`);
    }
    
    // Verificação de plausibilidade
    const minVolume = {
      BTCUSDT: 1000000,
      ETHUSDT: 500000,
      SOLUSDT: 100000,
      default: 50000
    }[simbolo] || minVolume.default;
    
    if (volume < minVolume) {
      throw new Error(`Volume suspeitamente baixo: ${volume}`);
    }

    return volume;
    
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Classificação de erros
    const errorType = err.name === 'AbortError' ? 'TIMEOUT' : 
                     err.message.includes('ECONN') ? 'CONNECTION' : 
                     'API_ERROR';
    
    if (tentativa < MAX_TENTATIVAS) {
      const delay = Math.pow(2, tentativa) * 2000 + Math.random() * 1000;
      await global.logger.log(
        `[${simbolo}] Tentativa ${tentativa+1}/${MAX_TENTATIVAS} | ${errorType}: ${err.message} - Nova tentativa em ${delay/1000}s`,
        'AVISO'
      );
      
      await new Promise(r => setTimeout(r, delay));
      return this.obterVolume(simbolo, tentativa + 1);
    } else {
      await global.logger.log(
        `[${simbolo}] Falha após ${MAX_TENTATIVAS} tentativas | Último erro: ${errorType}: ${err.message}`,
        'ERRO'
      );
      return 0;
    }
   }
 }

     static async atualizarEstadoPar(simbolo, estadoAtual) {
        // Fallback padrão em caso de falha crítica
        const fallbackState = {
            precoAtual: estadoAtual?.precoAtual || 0,
            rsi: estadoAtual?.rsi || 50,
            volume24h: estadoAtual?.volume24h || 0,
            volumeAtual: estadoAtual?.volumeAtual || 0,
            mediaVolume: estadoAtual?.mediaVolume || 0,
            emaShort: estadoAtual?.emaShort || 0,
            emaLong: estadoAtual?.emaLong || 0,
            atr: estadoAtual?.atr || 0,
            volatilidade: estadoAtual?.volatilidade || 0,
            tendencia: estadoAtual?.tendencia || 'NEUTRA',
            status: 'FALLBACK'
        };

        try {
             // ✅ Inicializar volatilidade antes de qualquer cálculo
             let volatilidade = estadoAtual?.volatilidade || 0;

            // 1. Obter dados básicos do mercado com timeout
            const [ticker, candles, volume24h] = await Promise.all([
                this.obterTicker(simbolo).catch(() => null),
                this.obterKlines(simbolo, '1m', 100).catch(() => []),
                this.obterVolume(simbolo).catch(() => 0)
            ]);

            // 2. Validar e processar ticker
            let precoAtual = ticker?.price ? parseFloat(ticker.price) : estadoAtual?.precoAtual || 0;

            // Se ainda for 0 ou inválido, usar fallback
            if (!precoAtual || isNaN(precoAtual) || precoAtual <= 0) {
                precoAtual = await this.obterPrecoAlternativo(simbolo) || estadoAtual?.precoAtual || 1;
            }
            
            // 3. Processar candles
            const precos = [];
            const volumes = [];
        
            if (Array.isArray(candles)) {
                for (const candle of candles) {
                    if (candle[4]) {
                        const precoFechamento = parseFloat(candle[4]);
                        if (!isNaN(precoFechamento)) precos.push(precoFechamento);
                    }
                    if (candle[5]) {
                        const volume = parseFloat(candle[5]);
                        if (!isNaN(volume)) volumes.push(volume);
                    }
                }
            }
            
            // 4. Garantir dados mínimos para indicadores
            const precosValidos = precos.length > 0 ? precos : estadoAtual?.historicoPrecos || [precoAtual];
            const volumesValidos = volumes.length > 0 ? volumes : estadoAtual?.historicoVolumes || [0];

            // 5. Calcular indicadores técnicos com fallbacks
            let rsi = estadoAtual?.rsi || 50;
            try {
                if (precosValidos.length > estrategia.RSI_PERIOD) {
                    rsi = Indicadores.calcRSI(precosValidos);
                }
            } catch (rsiErr) {
                await global.logger.log(`[${simbolo}] Erro no RSI: ${rsiErr.message}`, 'AVISO');
            }

            // Cálculo iterativo de EMAs
            let emaShort = estadoAtual?.emaShort || precoAtual;
            let emaLong = estadoAtual?.emaLong || precoAtual;
            if (precosValidos.length > 0) {
                const ultimoPreco = precosValidos[precosValidos.length - 1];
                emaShort = Indicadores.calcEMA(ultimoPreco, estrategia.EMA_SHORT_PERIOD, emaShort);
                emaLong = Indicadores.calcEMA(ultimoPreco, estrategia.EMA_LONG_PERIOD, emaLong);
            }

            // Calcular ATR e volatilidade
            let atr = estadoAtual?.atr || 0;
            try {
                atr = Indicadores.calcATR(precosValidos);

                if (precosValidos.length >= 10) {
                   volatilidade = Indicadores.calcVolatilidade(precosValidos);
                }

            } catch (volErr) {
                await global.logger.log(`[${simbolo}] [${atr}] [${volatilidade}] Erro em volatilidade: ${volErr.message}`, 'AVISO');
            }

            // ✅ Proteção contra NaN
            if (isNaN(volatilidade)) volatilidade = 0;

            // 6. Calcular MACD corretamente
            let macd = estadoAtual?.macd || { macd: 0, signal: 0, histogram: 0 };
            let historicoMACD = estadoAtual?.historicoMACD || []; 
            try {
                let macdLine = emaShort - emaLong;

                // ✅ Proteção contra NaN
                if (isNaN(macdLine)) {
                    macdLine = 0; // ou usar ultimo valor conhecido
                    await global.logger.log(`[${simbolo}] macdLine inválido (NaN). Usando fallback = 0`, 'AVISO');
                }
            
                // Manter histórico de MACD
                const historicoMACD = [...(estadoAtual?.historicoMACD || []), macdLine].slice(-30);

                // Calcular signal line
                let signalLine = macd.signal || 0;
                if (historicoMACD.length >= estrategia.MACD_SIGNAL) {
                    signalLine = Indicadores.calcEMA(historicoMACD[historicoMACD.length - 1], 
                                                  estrategia.MACD_SIGNAL, 
                                                  signalLine);
                }

                macd = {
                    macd: macdLine,
                    signal: signalLine,
                    histogram: macdLine - signalLine
                };
            } catch (macdErr) {
                await global.logger.log(`[${simbolo}] Erro no MACD: ${macdErr.message}`, 'AVISO');
            }
            
            // 7. Determinar tendência
            const tendencia = Indicadores.determinarTendencia(emaShort, emaLong, macd) || 'NEUTRA';
            
            // 8. Calcular volumes
            const volumeAtual = volumesValidos.length > 0 
                ? volumesValidos[volumesValidos.length - 1] 
                : estadoAtual?.volumeAtual || 0;
            
            // Média móvel de 20 períodos
            const periodoMedia = 20;
            const volumesRecentes = volumesValidos.slice(-periodoMedia);
            const mediaVolume = volumesRecentes.length > 0 
                ? volumesRecentes.reduce((sum, v) => sum + v, 0) / volumesRecentes.length 
                : estadoAtual?.mediaVolume || 0;

            // 9. Atualizar histórico
            const novoHistoricoPrecos = [
                ...(estadoAtual?.historicoPrecos || []), 
                precoAtual
            ].slice(-100);
        
            const novoHistoricoVolumes = [
                ...(estadoAtual?.historicoVolumes || []), 
                volumeAtual
            ].slice(-100);

            // 10. Retornar novo estado completo
            return {
                ...estadoAtual, // Manter todas as propriedades existentes
            
                // Propriedades atualizadas
                precoAtual,
                rsi,
                emaShort,
                emaLong,
                macd,
                atr,
                volatilidade,
                tendencia,
                volume24h,
                volumeAtual,
                mediaVolume,
                historicoPrecos: novoHistoricoPrecos,
                historicoVolumes: novoHistoricoVolumes,
                historicoMACD
            };
            
        } catch (err) {
            await global.logger.log(`[${simbolo}] ERRO CRÍTICO ao atualizar estado: ${err.message}`, 'ERRO');
        return {
            ...estadoAtual,
            precoAtual: estadoAtual?.precoAtual || 1,
            status: 'FALLBACK'
        };
        }
    }

    static obterPrecoFallback(simbolo) {
    // Valores fallback baseados no símbolo
        const precosFallback = {
            'BTCUSDT': 50000,
            'ETHUSDT': 3000,
            'SOLUSDT': 100,
            'DEFAULT': 1
        };
        
        return precosFallback[simbolo] || precosFallback.DEFAULT;
    }
} 

//=========== MÓDULO DE REDE NEURAL (IA) =================
class ModeloIA {
    constructor() {
        this.modelo = null;
        this.loggerHabilitado = false;
    }

    async treinar() {
        console.log("🔥 Iniciando treinamento da IA...");
        
        // 1. Criar modelo
        this.modelo = tf.sequential();
        
        // 2. Adicionar camadas
        this.modelo.add(tf.layers.dense({
            units: 64,
            inputShape: [5],
            activation: 'relu'
        }));
        this.modelo.add(tf.layers.dense({
            units: 32,
            activation: 'relu'
        }));
        this.modelo.add(tf.layers.dense({
            units: 1,
            activation: 'sigmoid'
        }));
        
        // 3. Compilar
        this.modelo.compile({
            optimizer: tf.train.adam(0.01),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        
        // 4. Gerar dados sintéticos
        const numAmostras = 1000;
        const dadosX = [];
        const dadosY = [];
        
        for (let i = 0; i < numAmostras; i++) {
            const sample = Array.from({length: 5}, () => Math.random());
            const label = sample.reduce((sum, val) => sum + val, 0) > 2.5 ? 1 : 0;
            dadosX.push(sample);
            dadosY.push(label);
        }
        
        // 5. Treinar
        await this.modelo.fit(
            tf.tensor2d(dadosX),
            tf.tensor1d(dadosY),
            {
                epochs: 20,
                batchSize: 32,
                validationSplit: 0.2,
                verbose: 1
            }
        );
        
        console.log("✅ IA treinada com sucesso");
    }

    prever(dadosEntrada) {
        if (!this.modelo) {
            throw new Error("Modelo não foi treinado");
        }
        
        return tf.tidy(() => {
            const entrada = tf.tensor2d([dadosEntrada]);
            const saida = this.modelo.predict(entrada);
            return saida.dataSync()[0];
        });
    }
}

// ===================== MÓDULO PRINCIPAL DO BOT =================
class BotAgressivo {
    constructor() {
        this.ia = new ModeloIA();
        this.simbolos = global.config?.PARES_ATIVOS 
          || (process.env.ATIVOS ? process.env.ATIVOS.split(",").map(p => p.trim().toUpperCase()) : ["BTCUSDT"]);
        global.paresAtivos = this.simbolos;
        this.estadoPar = false;
        this.intervalos = {};
        this.estados = {};
        this.loops = {};
        if (!global.estados) global.estados = {};

        // 1. Criar estados
        this.simbolos.forEach(simbolo => {
            this.estados[simbolo] = new estadoPar(simbolo);
            this.estados[simbolo].inicioExecucao = new Date().toISOString();
            this.estados[simbolo].healthCheck = {};
            Estado.registrarEstado(simbolo, this.estados[simbolo]);
        });

        setInterval(() => {
            const agora = Date.now();
            for (const simbolo of this.simbolos) {
                for (const [tipo, evento] of Object.entries(SistemaEmergencia.gatilhosAtivos[simbolo] || {})) {
                    // Limpar gatilhos com mais de 1 hora
                    if (agora - evento.timestamp > 3600000) {
                        SistemaEmergencia.limparGatilho(simbolo, tipo);
                    }
                }
            }
        }, 300000); // Salva a cada 5 minutos
    }

    // Método para inicializar um estado - CORRIGIDO
    async iniciarEstadoPar(simbolo) {
        try {
            console.log(`[${simbolo}] Inicializando estado...`);
            const estado = new estadoPar(simbolo);
                // INICIALIZAÇÃO DE FALLBACK
            if (!estado.saldos) {
                console.warn(`[${simbolo}] Saldos não inicializados! Criando fallback...`);
                const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
                estado.saldos = {
                    USDT: config.SALDO_INICIAL_USDT || 0,
                    [moedaBase]: config[`SALDO_INICIAL_${moedaBase}`] || 0
                };
            }
            console.log("Configurações de saldo inicial:", {
              USDT: config.SALDO_INICIAL_USDT,
              BTC: config.SALDO_INICIAL_BTC,
              ETH: config.SALDO_INICIAL_ETH,
              SOL: config.SALDO_INICIAL_SOL,
              BNB: config.SALDO_INICIAL_BNB
            });

            const resultado = await estado.carregarEstadoSalvo();
            console.log(`[${resultado}] Valor de resultado...`);
                
            // Determinar status
            let status;
            if (resultado.includes("carregado")) status = 'carregado';
            else if (resultado.includes("novo")) status = 'novo';
            else if (resultado.includes("recriado")) status = 'recriado';
            else status = 'erro';
            
            console.log(`[${status}] Valor de status...`);

            console.log(`[${simbolo}] ${resultado}`);

            // ✅ INICIALIZAR VALORES DE META PARA NOVOS PARES
             GerenciamentoRisco.inicializarValoresMeta(estado);

            return { estado, status };
        } catch (err) {
            return { estado: new estadoPar(simbolo), status: 'erro' };
        }
    }

    async inicializarBot() {
        console.log("🔥 Iniciando bot...");
        console.log(`🔥 Pares ativos: ${global.PARES_ATIVOS.join(', ')}`);

        // Carregar estados salvos
        const resultados = {
            carregado: [],
            novo: [],
            recriado: [],
            erro: []
        };

        // 1. Inicializar estados para cada par
        for (const par of global.PARES_ATIVOS) {
            try {
                console.log(`[${par}] Inicializando estado...`);
                const { estado, status: estadoStatus } = await this.iniciarEstadoPar(par);

                this.estados[par] = estado;
                Estado.registrarEstado(par, estado);

                if (estadoStatus === 'carregado') resultados.carregado.push(par);
                else if (estadoStatus === 'novo') resultados.novo.push(par);
                else if (estadoStatus === 'recriado') resultados.recriado.push(par);
                else resultados.erro.push(par);

                console.log(`[${par}] Estado inicializado (${estadoStatus})`);
            } catch (err) {
                console.error(`[${par}] ERRO na inicialização: ${err.message}`);
                resultados.erro.push(par);
            }
        }

        console.log("✅ Estados inicializados");
        
        // Função segura para formatar arrays
        function formatarLista(lista) {
            if (!lista || lista.length === 0) return 'Nenhum';
            return lista.join(', ');
        }

        console.log(`   - Carregados: ${formatarLista(resultados.carregado)}`);
        console.log(`   - Novos: ${formatarLista(resultados.novo)}`);
        console.log(`   - Recriados: ${formatarLista(resultados.recriado)}`);
        console.log(`   - Erros: ${formatarLista(resultados.erro)}`);

        try {
            // 3. Treinar IA
            await this.ia.treinar();

            // 4. Iniciar loop de atualização de pares
            this.intervaloAtualizacao = setInterval(async () => {
                await this.atualizarPares();
            }, config.INTERVALO);
            
            // 5. Iniciar loops de trading para cada símbolo
            this.simbolos.forEach(par => {
                this.iniciarLoopTrading(par);
            });

            // 6. Iniciar loop de parametrização por IA
            this.contadorCiclosIA = 0; // Inicializar contador
            this.intervaloParametrosIA = setInterval(async () => {
                try {
                    for (const par of global.PARES_ATIVOS) {
                        const estado = this.estados[par];
                        if (!estado) continue;

                        const parametros = IAParametros.obterParametrosOtimizados(estado);

                        // Aplicar parâmetros dinamicamente
                        config.RISK_PER_TRADE = parametros.risco;
                        estrategia.LUCRO_MINIMO = parametros.lucroMinimo;
                        estrategia.STOP_LOSS = parametros.stopLoss;
                        config.VOLUME_BASE = parametros.volume;
                        
                        if (parametros.ativacaoTurbo && !estado.modoTurbo) {
                            GerenciamentoRisco.ativarModoTurboComIA(par, estado);
                        }
                        
                        // Verificar qualidade e metas a cada ciclo
                        ControladorQualidade.verificarMetas(estado);
                    }
                    
                    // Log de status da IA a cada 5 ciclos (2.5 minutos)
                    this.contadorCiclosIA++;
                    if (this.contadorCiclosIA % 5 === 0) {
                        const relatorioIA = IAParametros.getRelatorio();
                        
                        // Verificar se o relatório tem dados válidos
                        if (relatorioIA.resultado && Object.keys(relatorioIA.resultado).length > 0) {
                            const riscoPercentual = (relatorioIA.resultado.risco * 100).toFixed(1);
                            const lucroMinimoPercentual = ((relatorioIA.resultado.lucroMinimo - 1) * 100).toFixed(2);

                            global.logger.log(
                                `🤖 PARAMETROS IA: ${relatorioIA.interpretacao} | Risco: ${riscoPercentual}% | Lucro Min: ${lucroMinimoPercentual}%`,
                                "INFO"
                            );
                        } else {
                            // Fallback caso não haja resultado válido
                            global.logger.log(
                                `🤖 PARAMETROS IA: ${relatorioIA.interpretacao} | Relatório sem dados de parâmetros`,
                                "AVISO"
                            );
                        }
                    }
                } catch (err) {
                    global.logger.log(`Erro no loop de parametrização IA: ${err.message}\n${err.stack}`, 'ERRO');
                    process.exit(0);
                }
            }, 30000); // 30 segundos

            // 7. Iniciar painel de controle
            await this.iniciarPainelControle();
            
            console.log(chalk.green("✅ Bot iniciado com sucesso"));
            console.log(`   - Pares carregados: ${formatarLista(resultados.carregado)}`);
            console.log(`   - Pares criados: ${formatarLista(resultados.novo)}`);
            console.log(`   - Pares recriados: ${formatarLista(resultados.recriado)}`);
            console.log(`   - Pares com erro: ${formatarLista(resultados.erro)}`);

            console.log("Teste obterSimboloString:", 
                global.obterSimboloString("BTCUSDT"), 
                global.obterSimboloString({simbolo: "ETHUSDT"}), 
                global.obterSimboloString({symbol: "SOLUSDT"})
            );
            
            this.configurarShutdown();
        } catch (erro) {
            console.error("Erro na inicialização do bot:", erro);
            this.encerrar();
        }
    }

  iniciarLoopTrading(par) {
      this.loops[par] = setInterval(async () => {
        // 🔽 Verificação crítica de segurança 🔽
        if (typeof global.obterSimboloString !== 'function') {
        console.error("❌ ERRO CRÍTICO: Função obterSimboloString não está disponível!");
        return;
        }
     try {
            // 1. Garantir que o estado existe e é válido
            if (!global.estados[par] || !(global.estados[par] instanceof estadoPar)) {
                global.estados[par] = new estadoPar(par);
                await global.logger.log(`[${par}] Estado reinicializado`, 'AVISO');
            }
            
            const estado = global.estados[par];
            
            // 2. Verificação mais significativa
            if (!estado || typeof estado !== 'object') {
                await global.logger.log(`[${par}] Estado inválido após inicialização`, 'ERRO');
                return;
            }
            
            // 3. Validação adicional de propriedades essenciais
            if (!estado.saldos || !estado.healthCheck) {
                await global.logger.log(`[${par}] Estrutura de estado corrompida`, 'ERRO');
                estado.reset();
            }
            
            // 3. Obter dados de preço com tratamento robusto
            let precoValor;
            let ultimaConexaoValor;

            // 4. Obter dados de preço com tratamento robusto
            try {
                const resultado = await ConexaoAPI.obterPrecoAtual(par);
                
                // Verificar se o resultado tem a estrutura esperada
                if (resultado && (resultado.precoAtual !== undefined || resultado.price !== undefined)) {
                    // Usar precoAtual se disponível, caso contrário usar price
                    precoValor = resultado.precoAtual !== undefined ? resultado.precoAtual : resultado.price;
                    ultimaConexaoValor = resultado.ultimaConexao;
                   //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                   console.log(`[PASSO] Passou por iniciarLoopTrading 1 ${ultimaConexaoValor} <> ${resultado.price} <> ${precoValor}  <>  ${resultado.ultimaConexao}- logger.iniciado: ${global.logger?.iniciado}`);
                   //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                } else {
                    throw new Error("Estrutura de retorno inválida");
                }

            } catch (err) {
                await global.logger.log(`[${par}] Erro ao obter preço: ${err.message}`, "ERRO");
                // Fallback para valores padrão
                precoValor = estado.precoAtual || this.obterPrecoFallback(par);
                ultimaConexaoValor = new Date().toISOString();
            }
            
            // 4. Converter e validar preço
            const precoNum = Number(precoValor);

            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
            console.log(`[PASSO] Passou por iniciarLoopTrading 2 ${precoValor}- logger.iniciado: ${global.logger?.iniciado}`);
            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

            // validação central
            if (isNaN(precoNum)) {
              await global.logger.log(`[${par}] Preço inválido recebido: ${precoNum}`, "ERRO");
              return; // evita propagar erro
            }

            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
            console.log(`[PASSO] Passou por iniciarLoopTrading 3 ${precoNum} <> ${ultimaConexaoValor}- logger.iniciado: ${global.logger?.iniciado}`);
            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

            // atualizar estado com número válido
            estado.precoAtual = precoNum;
            estado.healthCheck.ultimaConexao = ultimaConexaoValor;

            // atualizar histórico
            estado.historicoPrecos.push(precoNum);
            if (estado.historicoPrecos.length > 100) {
              estado.historicoPrecos.shift();
            }
            
            estado.volume24h = await ConexaoAPI.obterVolume(par);

            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
            console.log(`[PASSO] Passou por iniciarLoopTrading 4 ${estado.precoNum}  <>  ${estado.precoAtual} <> ${estado.volume24h}- logger.iniciado: ${global.logger?.iniciado}`);
            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                
                // Atualizar indicadores
                Indicadores.updateMACD(estado);
                estado.rsi = Indicadores.calcRSI(estado.historicoPrecos);
                estado.atr = Indicadores.calcATR(estado.historicoPrecos);
                estado.volatilidade = Indicadores.calcVolatilidade(estado.historicoPrecos);
                estado.tendencia = Indicadores.determinarTendencia(
                    estado.emaShort, 
                    estado.emaLong, 
                    estado.macd
                );

            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
            console.log(`[PASSO] Passou por iniciarLoopTrading 4.1 ${estado.precoNum}  <>  ${estado.precoAtual} <> ${estado.volume24h}- logger.iniciado: ${global.logger?.iniciado}`);
            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

                // Adicionar ao histórico
                estado.historicoPrecos.push(estado.precoAtual);
                if (estado.historicoPrecos.length > 100) {
                    estado.historicoPrecos.shift();
                }

                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por iniciarLoopTrading 4.2 ${paresAtivos}  <>  ${estado.precoAtual} <> ${estado.volume24h}- logger.iniciado: ${global.logger?.iniciado}`);
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                
                // Monitorar múltiplos pares simultaneamente
                await GerenciamentoRisco.monitorarProtecoesMultiPar();

                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por iniciarLoopTrading 4.3 ${par}  <>  ${estado.precoAtual} <> ${estado.volume24h}- logger.iniciado: ${global.logger?.iniciado}`);
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

                // Verificar oportunidades de trading
                await GerenciamentoRisco.verificarMicroOportunidades(par, estado);

                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por iniciarLoopTrading 4.4 ${par}  <>  ${estado.precoAtual} <> ${estado.volume24h}- logger.iniciado: ${global.logger?.iniciado}`);
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

                await Scalping.verificarOportunidadesRapidas(estado);
                
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por iniciarLoopTrading 5 ${estado.precoAtual} <> ${par}- logger.iniciado: ${global.logger?.iniciado}`);
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

                // Verificar proteções
                await GerenciamentoRisco.verificarProtecoes(par, estado, estado.precoAtual);

                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por iniciarLoopTrading 6 ${estado.precoAtual} <> ${precoNum}- logger.iniciado: ${global.logger?.iniciado}`);
                //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                
                // Verificar meta horária
                await GerenciamentoRisco.verificarMetaHorariaAgressiva(par, estado);

                // Atribuir aos objetos do estado:
                estado.precoAtual = precoNum;
                estado.healthCheck.ultimaConexao = ultimaConexaoValor;

                // Atualizar interface
                Interface.mostrarStatusPar(par, estado);
            
        } catch (erro) {
            await global.logger.log(`[${par}] Erro no loop: ${err.message}\n${err.stack}`, 'ERRO');
            process.exit(0);
        }
      }, config.INTERVALO);
    }

   async iniciarPainelControle() {
      try {
        // Inicia o painel de controle passando os estados dos pares
        await PainelControle.iniciar(this.estados);
        
        console.log(chalk.green('✅ Painel de controle inicializado'));
      } catch (err) {
        console.error(chalk.red('❌ Erro ao iniciar painel de controle:'), err);
        
        // Fallback: tentar subir em outra porta
        try {
            console.log(chalk.yellow('⚠️ Tentando fallback de porta...'));
            await PainelControle.iniciar(this.estados, 0); // 0 = porta aleatória
        } catch (fallbackErr) {
            console.error(chalk.red('❌ Falha catastrófica no painel:'), fallbackErr);
        }
      }
   }

  async encerrar() {
      if (this.encerrando) return;
      this.encerrando = true;
      console.log(chalk.yellow("⛔ Encerrando bot..."));

      try {
          // 1. Parar todos os intervalos e loops
          Object.values(this.intervalos).forEach(interval => clearInterval(interval));
          
          if (this.intervaloAtualizacao) {
              clearInterval(this.intervaloAtualizacao);
              console.log(chalk.yellow("⏹️ Loop de atualização de pares parado"));
          }

          // 2. Encerrar posições abertas e salvar estados
          await Promise.all(global.PARES_ATIVOS.map(async par => {
              const estado = this.estados[par];
              if (!estado) return;

              try {
                  // Encerrar posição se estiver em operação
                  if (estado.emOperacao) {
                      try {
                          const { price } = await ConexaoAPI.obterPrecoAtual(par);
                          const precoAtual = Number(price); 
                          if (precoAtual && !isNaN(precoAtual)) {
                              console.log(chalk.bgYellow(`[${par}] Encerrando posição aberta...`));
                              await Ordem.executarVenda(par, estado, precoAtual, null, 'SHUTDOWN VENDA');
                          } else {
                              await global.logger.log(`[${par}] Preço inválido no encerramento`, 'ERRO');
                          }
                      } catch (err) {
                          console.error(chalk.red(`[${par}] Erro ao encerrar posição:`), err);
                      }
                  }

                  // Salvar estado e estatísticas
                  await estado.salvarEstado();
                  await global.logger.salvarStats(par, estado);
                  await global.logger.salvarHistoricoDesempenho(par, estado);
                  console.log(chalk.green(`[${par}] Estado salvo com sucesso`));
                  
              } catch (err) {
                  console.error(chalk.red(`[${par}] Erro crítico ao processar:`), err);
                  // Tentar salvar em local alternativo
                  try {
                      const tempFile = path.join(os.tmpdir(), `emergency_save_${par}_${Date.now()}.json`);
                      await fs.writeFile(tempFile, JSON.stringify(estado));
                      console.log(chalk.yellow(`[${par}] Estado salvo em: ${tempFile}`));
                  } catch (saveErr) {
                      console.error(chalk.red(`[${par}] Falha catastrófica ao salvar emergência:`), saveErr);
                  }
              }
          }));

          console.log(chalk.green('✅ Todos estados e estatísticas salvos com sucesso.'));
      } catch (e) {
          console.error(chalk.red('Erro durante o encerramento:'), e);
      }

      // 3. Fechar servidor HTTP se existir
      if (this.server) {
          this.server.close(() => {
              console.log("✅ Servidor HTTP fechado");
          });
      }

      // 4. Encerrar processo
      console.log("✅ Bot encerrado com sucesso");
      process.exit(0);
  }

    // ====================== ATUALIZAÇÃO DOS PARES ======================
  async atualizarPares() {
      for (const par of global.PARES_ATIVOS) {
        const estado = this.estados[par];
        if (!estado) return;
    
        // Inicializar valores de meta
        GerenciamentoRisco.inicializarValoresMeta(estado);

        // Verificar estado de emergência antes de processar o par
        const estadoEmergencia = SistemaEmergencia.verificarEstadoGeral();
        
        // Se houver emergência geral, pausar todas as operações
        if (estadoEmergencia === 'EMERGÊNCIA') {
            await global.logger.log(`[${par}] 🚨 EMERGÊNCIA GERAL - Parando todas as operações`, 'ALERTA');
            continue;
        }

        // Verificar gatilhos específicos para este par
        const gatilhosPar = SistemaEmergencia.gatilhosAtivos[par] || {};
        const agora = Date.now();
        let temGatilhoAtivo = false;
        
        for (const [tipo, evento] of Object.entries(gatilhosPar)) {
            // Considerar gatilhos com menos de 30 minutos como ativos
            if (agora - evento.timestamp < 1800000) {
                temGatilhoAtivo = true;
                await global.logger.log(
                    `[${par}] ⚠️ Gatilho ativo: ${tipo} (${Math.round((agora - evento.timestamp)/1000)}s atrás)`,
                    'AVISO'
                );
                break;
            }
        }
        
        // Pular este par se houver gatilhos ativos
        if (temGatilhoAtivo) {
            // Tentar limpar gatilhos muito antigos (mais de 1 hora)
            for (const [tipo, evento] of Object.entries(gatilhosPar)) {
                if (agora - evento.timestamp > 3600000) {
                    SistemaEmergencia.limparGatilho(par, tipo);
                }
            }
            continue;
        }

        // ✅ INICIALIZAR VALORES DE META
        GerenciamentoRisco.inicializarValoresMeta(estado);

        // Obter dados atualizados do par
        try {
          const novosDados = await ConexaoAPI.atualizarEstadoPar(par, estado);
          if (novosDados) {
              // Atualizar APENAS as propriedades necessárias
              if (novosDados.precoAtual) estado.precoAtual = novosDados.precoAtual;

              // Propriedades de volume
              if (novosDados.volumeAtual) estado.volumeAtual = novosDados.volumeAtual;
              if (novosDados.mediaVolume) estado.mediaVolume = novosDados.mediaVolume;
              if (novosDados.volume24h) estado.volume24h = novosDados.volume24h;

              // Históricos
              estado.historicoPrecos = novosDados.historicoPrecos || estado.historicoPrecos;
              estado.historicoVolumes = novosDados.historicoVolumes || estado.historicoVolumes;

              // Indicadores
              estado.rsi = novosDados.rsi || estado.rsi;
              estado.emaShort = estado.precoAtual || 0;
              estado.emaLong  = estado.precoAtual || 0;
              estado.macd = novosDados.macd || estado.macd;
              estado.atr = novosDados.atr || estado.atr;
              estado.volatilidade = novosDados.volatilidade || estado.volatilidade;
              estado.tendencia = novosDados.tendencia || estado.tendencia;

              // Object.assign(estado, novosDados);
           }
         } catch (err) {
          await global.logger.log(`[${par}] Erro ao atualizar par: ${err.message}`, "ERRO");
         }
      }
  }
  async processarPar(par, estadoPar) {
      try {
        // 1. Obter símbolo de forma segura
        const simboloStr = global.obterSimboloString(par, estadoPar);
        const moedaBase = global.getMoedaBase(simboloStr);

        // 2. Atualização de dados
        const { price, ultimaConexao } = await ConexaoAPI.obterPrecoAtual(simboloStr);

        // garantir que seja número válido
        estadoPar.precoAtual = Number(price);
        estadoPar.healthCheck.ultimaConexao = ultimaConexao;

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por iniciarLoopTrading() ${estadoPar.precoAtual}  <>  ${price}- logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        if (isNaN(estadoPar.precoAtual)) {
            await global.logger.log(`[${simboloStr}] Preço inválido recebido: ${price}`, 'ERRO');
            return; // evita continuar com dado corrompido
        }
        estadoPar.volume24h = await ConexaoAPI.obterVolumeComFallback(simboloStr, estadoPar);

        // 3. Manter histórico controlado
        estadoPar.historicoPrecos.push(estadoPar.precoAtual);
        if (estadoPar.historicoPrecos.length > 100) {
            estadoPar.historicoPrecos.shift();
        }

        // 4. Calcular indicadores
        estadoPar.rsi = Indicadores.calcRSI(estadoPar.historicoPrecos);
        Indicadores.updateMACD(estadoPar);
        estadoPar.atr = Indicadores.calcATR(estadoPar.historicoPrecos);
        estadoPar.volatilidade = Indicadores.calcVolatilidade(estadoPar.historicoPrecos);
        estadoPar.tendencia = Indicadores.determinarTendencia(
            estadoPar.emaShort, 
            estadoPar.emaLong, 
            estadoPar.macd
        );

        // 5. Exibir resumo
        exibirResumoPar(simboloStr, estadoPar);

        // 6. Decisão de COMPRA
        if (!estadoPar.emOperacao && Indicadores.deveComprar(estadoPar)) {
            const preco = estadoPar.precoAtual;
            const qtd = await GerenciamentoRisco.calcularTamanhoPosicao(
                simboloStr, 
                estadoPar, 
                preco
            );
            
         const MINORDER = config.MINORDER?.[moedaBase] || config.MINORDER?.DEFAULT || 0.01;

            if (qtd > MINORDER) {
                const podeComprar = await GerenciamentoRisco.verificarCustoBeneficio(simboloStr, estadoPar, qtd, preco);

                if (podeComprar) {
                    await Ordem.executarCompra(simboloStr, estadoPar, preco, qtd, 'MICRO OPORTUNIDADE');
                } else {
                    await global.logger.log(`[${simboloStr}] Compra cancelada: custo/benefício ruim`, 'AVISO');
                }
            } else {
                await global.logger.log(`[${simboloStr}] Quantidade abaixo do mínimo: ${qtd} < ${MINORDER} ${moedaBase}`, 'AVISO');
            }
        }

        // 7. Decisão de VENDA
        else if (estadoPar.emOperacao && Indicadores.deveVender(estadoPar)) {
            const preco = estadoPar.precoAtual;
            const qtd = estadoPar.saldos?.[moedaBase] || 0;
            const MINORDER = config.MINORDER?.[moedaBase] || config.MINORDER?.DEFAULT || 0.01;

            if (qtd > MINORDER) {
                const podeVender = await GerenciamentoRisco.verificarCustoBeneficio(simboloStr, estadoPar, qtd, preco);
                
                if (podeVender) {
                    await Ordem.executarVenda(simboloStr, estadoPar, preco, null, 'MICRO OPORTUNIDADE');
                } else {
                    await global.logger.log(`[${simboloStr}] Venda cancelada: custo/benefício ruim`, 'AVISO');
                }
            }
        }

    } catch (err) {
        const simboloStr = par.simbolo || par.symbol || par || 'UNKNOWN';
        await global.logger.log(`[${simboloStr}] Erro no processamento: ${err.message}`, 'ERRO');
    }
  }
    configurarShutdown() {
      process.on('SIGINT', async () => {
        console.log("⛔ Encerrando bot...");
        await this.encerrar();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log("⛔ Encerrando bot...");
        await this.encerrar();
        process.exit(0);
      });
    }
}

// ====================== ORDENS ======================
class Ordem {
  static async getBalances() {
    if (config.SIMULA) {
      return {
        USDT: estado.saldos.USDT,
        BTC: estado.saldos.BTC
      };
    }
    try {
      const timestamp = Date.now();
      const query = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', config.API_SECRET).update(query).digest('hex');
      const url = `${getBinanceBaseUrl()}/api/v3/account?${query}&signature=${signature}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-MBX-APIKEY': config.API_KEY },
        timeout: 5000
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      estado.healthCheck.ultimaConexao = new Date().toISOString();
      const usdt = data.balances.find(b => b.asset === 'USDT') || { free: '0' };
      const btc = data.balances.find(b => b.asset === 'BTC') || { free: '0' };
      estado.saldos.USDT = parseFloat(usdt.free);
      estado.saldos.BTC = parseFloat(btc.free);
      return { USDT: estado.saldos.USDT, BTC: estado.saldos.BTC };
    } catch (err) {
      await global.logger.log(`Erro detalhado: ${JSON.stringify(err.response?.data || err.message)}`, 'ERRO');
      throw err;
    }
  }

  static async encontrarMelhorExecucao(simbolo, estado, qtd) {
    if (!estado) {
        estado = EstadoManager.getEstado(simbolo);
    };

    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    console.log(`[PASSO] Passou por encontrarMelhorExecucao 1 ${simbolo, estado, qtd} - logger.iniciado: ${global.logger?.iniciado}`);
    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

    try {
      const res = await fetch(`${getBinanceBaseUrl()}/api/v3/depth?symbol=${simbolo}&limit=5`);

      // Verifica status ANTES de processar dados
      if (!res.ok) {
        throw new Error(`API retornou status ${res.status}`);
      }

      // Converte resposta para JSON primeiro
      const data = await res.json();

      // Verifica estrutura dos dados APÓS inicialização
      if (!data || typeof data !== 'object') {
        throw new Error("Resposta da API não é um objeto válido");
      }
      if (!data.asks || !Array.isArray(data.asks)) {
        throw new Error("Formato de dados inválido da API");
      }

      let totalQtd = 0;
      let precoMedio = 0;
      let quantidadeRestante = qtd;

      for (const offer of data.asks) {
        const preco = parseFloat(offer[0]);
        const quantidadeDisponivel = parseFloat(offer[1]);

        if (isNaN(preco) || isNaN(quantidadeDisponivel)) {
          await global.logger.log(`[${simbolo}] Valor inválido no book: ${offer}`, "AVISO");
          continue;
        }

        const quantidadeExecutavel = Math.min(quantidadeRestante, quantidadeDisponivel);
        precoMedio += preco * quantidadeExecutavel;
        totalQtd += quantidadeExecutavel;
        quantidadeRestante -= quantidadeExecutavel;
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por encontrarMelhorExecucao 2 ${simbolo} <> ${precoMedio} <> ${quantidadeDisponivel} <> ${quantidadeRestante} <> ${totalQtd} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
        if (quantidadeRestante <= 0) break;
      }

      if (totalQtd === 0) {
        await global.logger.log("Nenhuma quantidade executável encontrada. Usando preço atual.", "AVISO");
        return estado ? estado.precoAtual : null; // fallback seguro
      }

      return precoMedio / totalQtd;

    } catch (err) {
      await global.logger.log(`Erro ao calcular melhor execução: ${err.message}`, "ERRO");
      return estado ? estado.precoAtual : null; // fallback em caso de erro
    }
  }


  static async obterSpreadReal() {
    try {
      const res = await fetch(`${getBinanceBaseUrl()}/api/v3/ticker/bookTicker?symbol=BTCUSDT`);
      const data = await res.json();
      const bid = parseFloat(data.bidPrice);
      const ask = parseFloat(data.askPrice);
      return (ask - bid) / bid;
    } catch (err) {
      await global.logger.log(`Erro ao obter spread: ${err.message}`, 'AVISO');
      return 0.0005;
    }
  }

  // ===================== Executar Ordem ======================
  static async enviarOrdem(simbolo, ativoBase, tipo, qtd, preco, estado) {
    if (config.SIMULA) {
      await global.logger.log(
        `Ordem ${ativoBase} simulada: ${qtd} ${simbolo} com ${preco} em (market)`, 'TRADE');
      return {
        status: 'FILLED',
        executedQty: qtd.toString(),
        price: preco || estado.precoAtual
      };
    }

    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    console.log(`[PASSO] Passou por enviarOrdem 1  ${simbolo} <> ${ativoBase} <> ${tipo} <> ${qtd} <> ${preco} <> ${estado}- logger.iniciado: ${global.logger?.iniciado}`);
    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
    
    try {
      // Usar a instância do Brian para enviar a ordem
      const side = tipo.toUpperCase(); // 'BUY' ou 'SELL'
      const orderType = preco ? 'LIMIT' : 'MARKET';
      
      const orderParams = {
        symbol: simbolo,
        side: side,
        type: orderType,
        quantity: qtd
      };

      // Adicionar preço para ordens limitadas
      if (preco) {
        orderParams.price = preco;
        orderParams.timeInForce = 'GTC';
      }

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por enviarOrdem 2  ${simbolo} <> ${side} <> ${orderType} <> ${qtd} - logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      estado.ultimoPrecoSolicitado = estado.precoAtual;

      const ativo = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
      const precisao = config.PRECISAO_ATIVOS?.[ativo] || config.BTC_PRECISION || 6;

      // Ajustar parâmetros conforme o tipo de ordem
      if (orderType === 'MARKET') {
        if (side === 'BUY') {
          // Para ordens de mercado de compra, usar quoteOrderQty
          orderParams.quoteOrderQty = (qtd * estado.precoAtual).toFixed(2);
          delete orderParams.quantity; // Remover quantity quando usar quoteOrderQty
        } else {
          // Para vendas no mercado, usar quantity
          orderParams.quantity = qtd.toFixed(precisao);
        }
      } else {
        // Ordem limitada
        orderParams.quantity = qtd.toFixed(precisao);
        orderParams.price = preco.toFixed(2);
        orderParams.timeInForce = 'GTC';
      }

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por enviarOrdem 3 => ${simbolo} <> ${JSON.stringify(orderParams)} - logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      // Enviar ordem usando o Brian
      const result = await brian.createOrder(
        orderParams.symbol,
        orderParams.side,
        orderParams.type,
        orderParams
      );

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por enviarOrdem 4 => ${simbolo} <> Ordem executada com sucesso - logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      // Atualizar estado com o resultado da ordem
      estado.healthCheck.ultimaConexao = new Date().toISOString();
      estado.ultimoPrecoExecutado = parseFloat(result.price) || estado.precoAtual;
      
      return result;

    } catch (err) {
      estado.healthCheck.ordensRejeitadas++;
      await global.logger.log(`Erro ao enviar ordem ${tipo} [${simbolo}]: ${err.message}`, 'ERRO');
      throw err;
    }
  }


  static async executarCompra(simbolo, estado, precoAtual, qtd = 0, motivo = 'OPERACAO NORMAL') {
    let simboloStr = null;
     //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
     console.log(`[PASSO] Passou por executarCompra 1 ${simbolo} <> ${estado} <> ${precoAtual} <> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
     //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
    try {
      if (estado.emOperacao) {
        await global.logger.log(
            `[${simbolo}] Ignorando compra - já está em operação`,
            'AVISO'
        );
            return false;
      }
      // Converter QUALQUER tipo de entrada em string de símbolo
      const simboloStr = global.obterSimboloString(simbolo, estado);
      const moedaBase = simboloStr.replace("USDT", "");

      if (!config.SIMULA) {
        const saldoUSDT = await ConexaoAPI.obterSaldo('USDT', estado);
        if (saldoUSDT !== undefined) {
            estado.saldos.USDT = saldoUSDT;
        }
      }

      // Garantir que motivo seja sempre string
      if (typeof motivo !== 'string') {
         motivo = String(motivo || 'SINAL');
      }

      if (!estado || !estado.saldos?.USDT) {
          await global.logger.log(`[${simboloStr}] Estado inválido durante compra!`, 'ERRO');
          return false;
      }
      
      const urgente = 
          motivo.includes('URGÊNCIA') || 
          motivo.includes('PANIC') || 
          motivo.includes('FORÇADA') ||
          motivo.includes('FORÇADO') || 
          motivo.includes('META FORÇADA') ||
          motivo.includes('TURBO') ||
          motivo.includes('SCALP') ||
          motivo.includes('RÁPIDO') ||
          motivo.includes('RECUPERAÇÃO');
      let spread = 0;

      if (!urgente && !await GerenciamentoRisco.verificarViabilidadeOperacional(simboloStr, estado, urgente)) {
        await global.logger.log(`[${simboloStr}] Compra cancelada: condições inviáveis`, 'AVISO');
        return;
      }

      let quantidade = qtd || await GerenciamentoRisco.calcularTamanhoPosicao(precoAtual, estado);
      const saldoUSDT = estado.saldos.USDT || 0;
      const precision = config.precision[moedaBase] || config.precision.DEFAULT;
      const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;

      if (saldoUSDT <= 0 || saldoUSDT < MINORDER * precoAtual) {
        await global.logger.log(
            `[${simboloStr}] Saldo USDT insuficiente para compra: ${saldoUSDT} < ${MINORDER * precoAtual}`,
            'AVISO'
        );
            return false;
      }

      // Se qtd for null/undefined, usar cálculo baseado no saldo
      if (qtd === null || qtd === undefined) {
        quantidade = saldoUSDT / precoAtual;
      }
      quantidade = parseFloat(quantidade.toFixed(precision));

      if (quantidade < MINORDER) {
        await global.logger.log(`[${simboloStr}] Quantidade inválida: ${quantidade}`, 'AVISO');
        return;
      }

      if (typeof motivo !== 'string') motivo = String(motivo || 'SINAL');

      let precoOtimo = precoAtual;
      const usarOtimizacao = !motivo.includes('TURBO') && !motivo.includes('FORÇADA');

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por executarCompra 2 ${simboloStr} <> ${precoOtimo} <> ${usarOtimizacao} <> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      if (usarOtimizacao && quantidade > 0.001) {
        try {
          precoOtimo = await Ordem.encontrarMelhorExecucao(simboloStr, estado, quantidade); 
          spread = Math.abs(precoOtimo - precoAtual) / precoAtual;

          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por executarCompra 2 ${simboloStr} <> ${precoOtimo} <> ${spread} <> ${quantidade}- logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

          if (spread > 0.003) {
            await global.logger.log(`[${simboloStr}] Spread alto: ${(spread*100).toFixed(2)}%. Compra cancelada.`, "AVISO");
            return;
          }

          await global.logger.log(`[${simboloStr}] Execução otimizada: ${precoAtual.toFixed(2)} → ${precoOtimo.toFixed(2)}`, "INFO");
        } catch (err) {
          await global.logger.log(`[${simboloStr}] Otimização falhou: ${err.message}`, "AVISO");
        }
      }

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por executarCompra 3 ${simboloStr} <> ${precoOtimo} <> ${quantidade} <> ${spread} <> ${urgente}<> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
      let custoAceitavel = null;
      if (!urgente) {
          custoAceitavel = await GerenciamentoRisco.verificarCustoBeneficio(simboloStr, estado, quantidade, precoAtual);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por executarCompra 3 ${simboloStr} <> ${custoAceitavel} <> ${quantidade} <> ${precoAtual} <> ${urgente}<> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
          if (!custoAceitavel) {
            await global.logger.log(`[${simboloStr}] Compra cancelada: custo-benefício ruim`, "AVISO");
            return;
          }
      }
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por executarCompra 4 ${simboloStr} <> ${custoAceitavel} <> ${spread} <> ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      const { taxa, valorLiquido } = await GerenciamentoRisco.calcularTaxas(simboloStr, quantidade, precoOtimo);
      const valorNecessario = valorLiquido * 1.002;

      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
      console.log(`[PASSO] Passou por executarCompra 5 ${simboloStr} <> ${taxa} <> ${estado.saldos.USDT} <> ${valorNecessario} ${motivo}- logger.iniciado: ${global.logger?.iniciado}`);
      //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

      if (valorNecessario > estado.saldos.USDT) {
          await global.logger.log(`[${simboloStr}] Saldo insuficiente: necessário ${valorNecessario.toFixed(2)}, disponível ${estado.saldos.USDT.toFixed(2)}`, 'AVISO');
          return;
      }
      const res = await this.enviarOrdem(simboloStr, 'BUY', 'LIMIT', quantidade, precoOtimo, estado);
      if (res && res.status === 'FILLED') {
          const executedQty = parseFloat(res.executedQty);
          const executedPrice = parseFloat(res.price) || precoAtual;
          const { taxa: taxaReal } = await GerenciamentoRisco.calcularTaxas(simboloStr, executedQty, executedPrice);

          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
          console.log(`[PASSO] Passou por executarCompra 6 ${simboloStr} <> ${executedQty} <> ${executedPrice} <> ${taxa} <> ${taxaReal}- logger.iniciado: ${global.logger?.iniciado}`);
          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

          estado.saldos[moedaBase] += executedQty
          estado.saldos.USDT -= (executedQty * executedPrice + taxaReal);
          estado.ultimaCompra = executedPrice;
          estado.ultimaCompraQtd = executedQty;
          estado.ultimaOperacao = motivo;
          estado.ultimaOperacaoTimestamp = Date.now();
          estado.emOperacao = true;
          estado.tradesHoje++;
          estado.precoRef = executedPrice;
          estado.healthCheck.totalTaxas = (estado.healthCheck.totalTaxas || 0) + (taxaReal || taxa);

          estado.stopLoss = executedPrice - (estado.atr * estrategia.STOP_LOSS_ATR_MULTIPLIER);
          estado.takeProfit = GerenciamentoRisco.calcularTakeProfit(executedPrice, estado);
          estado.stopMovel = estado.stopLoss;

          await global.logger.logCSV(
              'COMPRA',
              executedPrice,
              executedQty,
              taxaReal,
              estado.rsi,
              estado.emaShort,
              estado.emaLong,
              estado.macd,
              estado.atr,
              estado.volatilidade,
              estado.threshold,
              estado.drawdown,
              estado
          );

            Interface.mostrarStatusPar(
                simboloStr,
                estado,
                chalk.bgBlue(`🔵 [${simboloStr}] ${motivo}: ${executedQty.toFixed(6)} @ ${executedPrice.toFixed(2)} | Taxa: ${taxaReal.toFixed(2)} | Saldo: ${estado.saldos.USDT.toFixed(2)}`)
            );

            await estado.salvarEstado();
            return true;
      }
      return false;
    } catch (err) {
        await global.logger.log(`[${simboloStr}] ERRO Compra: ${err.message}\n${err.stack}`, 'ERRO');
        return false;
    }
  }

  static async executarVenda(simbolo, estado, precoAtual, qtd = 0, motivo = 'OPERACAO NORMAL') {
      let simboloStr = null;
      try {
        simboloStr = global.obterSimboloString(simbolo, estado);
        const moedaBase = simboloStr.replace("USDT", "");

        if (!config.SIMULA) {
          const saldoReal = await ConexaoAPI.obterSaldo(moedaBase, estado);
          if (saldoReal !== undefined) {
            estado.saldos[moedaBase] = saldoReal;
          }
        }

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] executarVenda 1 ${simboloStr} ${moedaBase} <> saldo[${moedaBase}]: ${estado?.saldos?.[moedaBase] ?? 'N/A'} <> saldo[USDT]: ${estado?.saldos?.USDT ?? 'N/A'} - logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        // VERIFICAÇÃO DE SALDO (código existente)
        if (!estado || estado.saldos?.[moedaBase] === undefined || estado.saldos?.[moedaBase] === null) {
          await global.logger.log(`[${simboloStr}] Estado inválido durante venda!`, 'ERRO');
          return false;
        }

        // 2. Verificação robusta de saldo
        const saldoDisponivel = estado.saldos[moedaBase] || 0;
        const precision = config.precision[moedaBase] || config.precision.DEFAULT;
        const MINORDER = config.MINORDER[moedaBase] || config.MINORDER.DEFAULT;

        if (saldoDisponivel <= 0 || saldoDisponivel < MINORDER) {
          await global.logger.log(`[${simboloStr}] Saldo insuficiente para venda: ${saldoDisponivel} ${moedaBase} < ${MINORDER}`, 'AVISO');
          return false;
        }

    
        // Determinar quantidade
        let quantidade = (qtd !== null && qtd !== undefined) ? qtd : saldoDisponivel;
        quantidade = Math.min(quantidade, saldoDisponivel);

        // Aplicar precisão
        quantidade = Math.floor(quantidade * (10 ** precision)) / (10 ** precision);

        // Verificação final após ajustes
        if (quantidade < MINORDER) {
          await global.logger.log(`[${simboloStr}] Quantidade insuficiente após ajuste: ${quantidade} < ${MINORDER} ${moedaBase}`, 'AVISO');
          return false;
        }

        // Garantir que motivo seja sempre string
        if (typeof motivo !== 'string') motivo = String(motivo || 'OPERACAO NORMAL');

        // Verificação adicional para saldo insuficiente
        if (saldoDisponivel <= 0) {
            await global.logger.log(`[${simboloStr}] Saldo insuficiente para venda: ${estado.saldos[moedaBase]}`, 'AVISO');
            return false;
        }

        if (!estado.emOperacao || saldoDisponivel < MINORDER) {
          await global.logger.log(`[${simboloStr}] Sem posição para vender`, 'AVISO');
          return;
        }

        const isTurbo = motivo.includes('TURBO') || estado.modoRecuperacao;
        const isPanic = motivo.includes('PANIC') || motivo.includes('STOP');
        const lucroMinimoPercent = isTurbo ? 0.0006 : (isPanic ? -0.008 : 0.002);
        const precoMinimoVenda = estado.ultimaCompra * (1 + lucroMinimoPercent);
        const spreadReal = await this.obterSpreadReal(simbolo);

        if (spreadReal > 0.003 && !isPanic) {
          await global.logger.log(`[${simboloStr}] Spread elevado (${(spreadReal*100).toFixed(2)}%) - venda adiada`, 'AVISO');
          return;
        }

        const precoVendaAjustado = precoAtual * (1 - (spreadReal / 2));
        const lucroBruto = (precoVendaAjustado - estado.ultimaCompra) * estado.ultimaCompraQtd;
        const { taxa: taxaReal } = await GerenciamentoRisco.calcularTaxas(simboloStr, estado.ultimaCompraQtd, precoVendaAjustado);
        const lucroLiquido = lucroBruto - taxaReal;

        if (!isPanic && precoVendaAjustado < precoMinimoVenda) {
          await global.logger.log(`[${simboloStr}] Lucro insuficiente: ${lucroLiquido.toFixed(2)} USDT`, 'AVISO');
          return;
        }

        if (quantidade > saldoDisponivel) {
          await global.logger.log(`[${simboloStr}] Saldo insuficiente: tem ${saldoDisponivel}, tentou vender ${quantidade}`, 'ERRO');
          return false;
        }

        const res = await this.enviarOrdem(simboloStr, 'SELL', 'LIMIT', quantidade, precoVendaAjustado, estado);

        if (res && (res.status === 'FILLED' || res.status === 'PARTIALLY_FILLED')) {
          const executedQty = parseFloat(res.executedQty || quantidade);
          let executedPrice = parseFloat(res.price || precoVendaAjustado);
          if (!executedPrice || executedPrice <= 0) executedPrice = precoVendaAjustado;

          const { taxa: taxaRealExecutada } = await GerenciamentoRisco.calcularTaxas(simboloStr, executedQty, executedPrice);
          const lucroReal = (executedPrice - estado.ultimaCompra) * executedQty - taxaRealExecutada;

          estado.saldos[moedaBase] -= executedQty;
          estado.saldos.USDT += executedPrice * executedQty - taxaRealExecutada;
          estado.lucroAcumulado += lucroReal;
          estado.lucroDia += lucroReal;
          estado.lucroHorario += lucroReal;
          estado.ultimaVenda = executedPrice;
          estado.ultimaVendaQtd = executedQty;
          estado.ultimaOperacao = motivo;
          estado.ultimaOperacaoTimestamp = Date.now();
          estado.emOperacao = false;
          estado.tradesHoje++;
          estado.healthCheck.totalTaxas += (taxaRealExecutada || 0);
          estado.stopLoss = null;
          estado.takeProfit = null;
          estado.stopMovel = null;

          await global.logger.logCSV(
              'VENDA',
              executedPrice,
              executedQty,
              taxaRealExecutada,
              estado.rsi,
              estado.emaShort,
              estado.emaLong,
              estado.macd,
              estado.atr,
              estado.volatilidade,
              estado.threshold,
              estado.drawdown,
              estado
          );

          const corLucro = lucroReal >= 0 ? chalk.green : chalk.red;
          Interface.mostrarStatusPar(
              simboloStr,
              estado,
              chalk.bgRed(
                  `🔴 [${simboloStr}] ${motivo}: ${executedQty.toFixed(6)} @ ${executedPrice.toFixed(2)} | ` +
                  `Lucro: ${corLucro(lucroReal.toFixed(2))} | Taxa: ${taxaRealExecutada.toFixed(2)} | Saldo: ${estado.saldos.USDT.toFixed(2)}`
              )
          );

          await estado.salvarEstado();
          await global.logger.salvarStats(simboloStr, estado)

        } else if (res && res.status === 'NEW') {
            // 🚀 Tratamento especial para NEW
            await global.logger.log(`[${simboloStr}] Ordem de venda colocada com sucesso (aguardando execução).`, 'INFO');
            estado.ordemPendente = {
                id: res.orderId,
                qty: quantidade,
                price: precoVendaAjustado,
                side: 'SELL',
                timestamp: Date.now()
            };
            await estado.salvarEstado();

        } else {
            await global.logger.log(`[${simboloStr}] Falha na execução da venda: ${res?.status}`, 'ERRO');
        }
      } catch (err) {
        await global.logger.log(`[${simboloStr}] ERRO em Venda: ${err.message}\n${err.stack}`, 'ERRO');
        process.exit(0);
      }
  }

   // 7. Função Principal: executarCicloTrading
    async executarCicloTrading() {
        try {
            console.log(`Iniciando ciclo para ${global.PARES_ATIVOS.length} pares`);
            
            for (const par of global.PARES_ATIVOS) {
                try {
                    console.log(`Processando par: ${par}`);
                    
                    // 1. Obter estado atual do par (não anterior)
                    const estado = this.estados[par] || await Estado.obterEstadoPar(par);
                    
                    if (!estado) {
                        console.log(`[AVISO] Estado não encontrado para ${par}`);
                        continue;
                    }
                    
                    // 2. Atualizar estado com novos dados da API
                    const novosDados = await ConexaoAPI.atualizarEstadoPar(par, estado);
                    
                    if (!novosDados) {
                        console.log(`[AVISO] Dados não atualizados para ${par}`);
                        continue;
                    }
                    
                    // 3. Atualizar apenas as propriedades necessárias do estado
                    Object.assign(estado, novosDados);
                    
                    // 4. Salvar estado atualizado
                    await estado.salvarEstado();
                    
                    // 5. Obter sinais de trading
                    const sinais = await Sinais.obterSinais(par, estado);
                    console.log(`Sinais para ${par}:`, sinais);
                    
                    // 6. Executar ações baseadas em sinais
                    if (!estado.emOperacao && sinais.comprar) {
                        const qtd = estado.saldos.USDT * 0.1 / estado.precoAtual;
                        await Ordem.executarCompra(par, estado, estado.precoAtual, qtd, 'CICLO TRANDINGSINAL');
                    } else if (estado.emOperacao && sinais.vender) {
                        await Ordem.executarVenda(par, estado, estado.precoAtual, null, 'CICLO TRANDINGSINAL');
                    }
                    
                    // 7. Verificar proteções (stop loss, take profit, etc)
                    await GerenciamentoRisco.verificarProtecoes(par, estado, estado.precoAtual);
                    
                    console.log(`✅ ${par} processado com sucesso`);
                } catch (err) {
                    console.error(`❌ Erro ao processar ${par}: ${err.message}`);
                }
            }
        } catch (err) {
            console.error("[ERRO GLOBAL NO CICLO]", err.message);
        }
    }
}

// ====================== OTIMIZADOR DE META ======================
class ProfitOptimizer {
  static updateDailyTarget(simbolo, estadoPar) {
    const horasRestantes = 24 - new Date().getHours();
    const saldoInicial = estadoPar.saldoInicialDia || estadoPar.saldos?.USDT;
    const lucroDia = estadoPar.lucroDia || 0;
    const lucroNecessario = (saldoInicial * config.LUCRO_DIARIO_ALVO) - lucroDia;

    if (horasRestantes < 4 && lucroNecessario > 0) {
      const novaMetaHoraria = lucroNecessario / Math.max(1, horasRestantes) * 1.3;
      estadoPar.metaHoraria = novaMetaHoraria;
      estadoPar.lucroMinimoDinamico = 1 + (novaMetaHoraria / Math.max(1, estadoPar.saldos?.USDT * 0.8));

      if (global.logger) {
        global.logger.log(
          `[${simbolo}] 📈 Meta horária: ${novaMetaHoraria.toFixed(4)} USDT | ` +
          `Alvo: ${((estadoPar.lucroMinimoDinamico - 1) * 100).toFixed(4)}%`,
          "OTIMIZACAO"
        );
      }
    }
  }
}

// ====================== OTIMIZADOR DE ESTRATÉGIA ======================
class OtimizadorEstrategia {
  static historicoDesempenho = [];
  
  static async ajustarParametros(estados) {
    if (this.historicoDesempenho.length < 5) return;
    
    const pares = Object.values(estados);
    if (pares.length === 0) return;
    
    const primeiroPar = pares[0];
    const volatilidadeMercado = primeiroPar.volatilidade * 100;
    const desempenhoMedio = this.calcularMediaDesempenho();    
    
    if (desempenhoMedio < 0.8) {
      estrategia.RSI_COMPRA_MAX = Math.min(85, estrategia.RSI_COMPRA_MAX + 5);
      global.logger.log(`⬆️ RSI_COMPRA_MAX ajustado para ${estrategia.RSI_COMPRA_MAX}`, "OTIMIZACAO");
    }
    
    if (volatilidadeMercado > 2.5) {
      config.RISK_PER_TRADE = Math.min(3.5, config.RISK_PER_TRADE * 1.3);
      estrategia.STOP_LOSS_ATR_MULTIPLIER = Math.max(0.5, estrategia.STOP_LOSS_ATR_MULTIPLIER * 0.8);
      global.logger.log(
        `↗️ RISK_PER_TRADE: ${config.RISK_PER_TRADE.toFixed(2)} | ` +
        `STOP_MULT: ${estrategia.STOP_LOSS_ATR_MULTIPLIER.toFixed(2)}`,
        "OTIMIZACAO"
      );
    }
  }
  
  static calcularMediaDesempenho() {
    const ultimos5 = this.historicoDesempenho.slice(-5);
    if (ultimos5.length === 0) return 0;
    return ultimos5.reduce((sum, d) => sum + d.efficiency, 0) / ultimos5.length;
  }

  static registrarDesempenho(efficiency) {
    this.historicoDesempenho.push({
      timestamp: Date.now(),
      efficiency,
      params: {...estrategia}
    });
    if (this.historicoDesempenho.length > 20) {
      this.historicoDesempenho.shift();
    }
  }
}

// Inicialização estática
if (!OtimizadorEstrategia.historicoDesempenho) {
  OtimizadorEstrategia.historicoDesempenho = [];
}

// ====================== BENCHMARK COMPETITIVO ======================
class BenchmarkCompetitivo {
  static async obterDesempenhoExterno(estados) {
    try {
      const binanceURL = 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT';
      const coingeckoURL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin';

      const [binanceRes, coingeckoRes] = await Promise.allSettled([
        fetch(binanceURL),
        fetch(coingeckoURL)
      ]);

      let binanceData, coingeckoData;
      if (binanceRes.status === 'fulfilled') {
        binanceData = await binanceRes.value.json();
      }
      if (coingeckoRes.status === 'fulfilled') {
        coingeckoData = await coingeckoRes.value.json();
      }

      // Aplique o benchmark a cada par
      for (const simbolo in estados) {
        const e = estados[simbolo];

        if (binanceData?.priceChangePercent) {
          e.benchmarkBTC = parseFloat(binanceData.priceChangePercent) / 100;
        }

        if (coingeckoData?.[0]) {
          e.benchmarkMercado = coingeckoData[0].price_change_percentage_24h / 100;
        }

        e.benchmarkBots = {
          botA: (Math.random() * 0.8 + 0.3) / 100,
          botB: (Math.random() * 1.2 + 0.2) / 100
        };
      }

    } catch (err) {
      await global.logger.log(`Erro no benchmark: ${err.message}`, "AVISO");
    }
  }
}

  // ====================== SISTEMA DE EMERGÊNCIA ======================
  class SistemaEmergencia {
    static gatilhosAtivos = {};
    static gatilhos = {};  // chave: simbolo -> objeto de gatilhos
    static ultimaAtivacao = {};  // chave: simbolo -> timestamp
    static TEMPO_DESATIVACAO = 3600000;

    static initsimbolo(simbolo) {
      if (!this.gatilhos[simbolo]) {
        this.gatilhos[simbolo] = {
          perdaExcessiva: false,
          falhaMercado: false,
          volatilidadeExtrema: false,
          falhaSistema: false,
          slippageExcessivo: false,
          falhaExecucao: false
        };
      }
    }

    static verificarGatilhos(simbolo, estadoPar) {
      this.initsimbolo(simbolo);
      const gatilhosAtivos = this.gatilhos[simbolo];

      if (this.isAtivo(simbolo)) {
        if (Date.now() - (this.ultimaAtivacao[simbolo] || 0) > this.TEMPO_DESATIVACAO) {
          this.desativarModoSeguranca(simbolo);
        }
        return false;
      }

      const capitalAtual = estadoPar.saldos?.USDT + (estadoPar.saldos?.BTC * estadoPar.precoAtual);
      const perdaDiaria = (estadoPar.saldoInicialDia - capitalAtual) / estadoPar.saldoInicialDia;

      if (perdaDiaria > config.PERDA_DIARIA_MAXIMA) {
        this.gatilhosAtivos.perdaExcessiva = true;
        this.ultimaAtivacao[simbolo] = Date.now();
        return true;
      }

      if (estadoPar.volatilidade > 0.10) {
        this.gatilhosAtivos.volatilidadeExtrema = true;
        this.ultimaAtivacao[simbolo] = Date.now();
        return true;
      }

      if (estadoPar.healthCheck.totalTrades > 10) {
        const taxaErros = estadoPar.healthCheck.totalErros / estadoPar.healthCheck.totalTrades;
        if (taxaErros > 0.5) {
          this.gatilhosAtivos.falhaSistema = true;
          this.ultimaAtivacao[simbolo] = Date.now();
          return true;
        }
      }

      if (estadoPar.ultimoPrecoSolicitado && estadoPar.ultimoPrecoExecutado) {
        const slippage = Math.abs(estadoPar.ultimoPrecoExecutado - estadoPar.ultimoPrecoSolicitado) / estadoPar.ultimoPrecoSolicitado;
        if (slippage > 0.01) {
          this.gatilhosAtivos.slippageExcessivo = true;
          this.ultimaAtivacao[simbolo] = Date.now();
          return true;
        }
      }

      if (estadoPar.healthCheck.ordensRejeitadas > 3) {
        this.gatilhosAtivos.falhaExecucao = true;
        this.ultimaAtivacao[simbolo] = Date.now();
        return true;
      }

      return false;
    }

    static isAtivo(simbolo) {
      return Object.values(this.gatilhos[simbolo] || {}).some(v => v);
    }

    static async ativarModoSeguranca(simbolo, estadoPar) {
      if (this.isAtivo(simbolo)) return;

      Interface.mostrarStatusPar(chalk.bgRed.white(`🚨 ${simbolo}: EMERGÊNCIA - MODO SEGURANÇA ATIVADO!`));
      config.RISK_PER_TRADE = Math.max(0.5, config.RISK_PER_TRADE * 0.5);
      estrategia.LUCRO_MINIMO = 1.01;

      await global.logger.log(`[${simbolo}] Modo segurança ativado`, "ALERTA");

      if (estadoPar.emOperacao) {
        await global.logger.log(`[${simbolo}] Posição em aberto mantida com parâmetros conservadores`, "INFO");
      }

      await this.notificarAdministrador(simbolo, estadoPar);
    }

    static desativarModoSeguranca(simbolo) {
      if (!this.isAtivo(simbolo)) return;

      config.RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '1.5');
      estrategia.LUCRO_MINIMO = 1.005;

      Object.keys(this.gatilhos[simbolo]).forEach(k => this.gatilhos[simbolo][k] = false);

      global.logger.log(`✅ [${simbolo}] MODO SEGURANÇA DESATIVADO`, "ALERTA");
    }

    static async notificarAdministrador(simbolo, estadoPar) {
      try {
        const motivo = Object.keys(this.gatilhos[simbolo])
          .filter(k => this.gatilhos[simbolo][k])
          .join(', ')
          .replace(/_/g, ' ');

        const dataHora = Utils.formatarData(new Date());
        const moedaBase = (typeof simbolo === 'string' ? simbolo : simbolo.simbolo || '').replace('USDT', '');
        const saldoBase = (estadoPar.saldos?.[moedaBase] || 0).toFixed(6) || '0.000000';
        const valorBase = ((estadoPar.saldos?.[moedaBase] || 0) * (estadoPar.precoAtual || 0)).toFixed(2);
        const saldoUSDT = (estadoPar.saldos && estadoPar.saldos?.USDT) || 0;
        const total = (parseFloat(saldoUSDT) + parseFloat(valorBase)).toFixed(2);

        const mensagem = `🚨 *EMERGÊNCIA [${simbolo}]* 🚨\n\n` +
           `*Motivo:* ${motivo}\n` +
           `*Hora:* ${dataHora}\n` +
           `*Saldo:* ${saldoUSDT} USDT | ${saldoBase} ${moedaBase} (${valorBase} USD)\n` +
           `*Total:* ${total} USD\n` +
           `*Preço:* ${estadoPar.precoAtual.toFixed(2)}\n` +
           `*Erros:* ${estadoPar.healthCheck.totalErros} | Trades: ${estadoPar.tradesHoje}\n`;

        await global.logger.log(mensagem, "ALERTA");
      } catch (err) {
        await global.logger.log(`Erro ao notificar admin [${simbolo}]: ${err.message}`, "ERRO");
      }
    }
    
    static registrarEvento(tipo, simbolo, dados) {
        // Inicializar gatilhos para o símbolo se não existir
        if (!this.gatilhosAtivos[simbolo]) {
            this.gatilhosAtivos[simbolo] = {};
        }

        // Registrar evento
        this.gatilhosAtivos[simbolo][tipo] = {
            timestamp: Date.now(),
            dados: dados
        };

        global.logger.log(`[EMERGÊNCIA][${simbolo}] ${tipo}: ${JSON.stringify(dados)}`, 'ALERTA');
    }

    static limparGatilho(simbolo, tipo) {
        if (this.gatilhosAtivos?.[simbolo]?.[tipo]) {
             //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
             console.log(`[PASSO] Passou por limparGatilho 1 ${simbolo} <>  ${tipo} <> ${this.gatilhosAtivos?.[simbolo]?.[tipo]}- logger.iniciado: ${global.logger?.iniciado}`);
            //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
            delete this.gatilhosAtivos[simbolo][tipo];

            if (Object.keys(this.gatilhosAtivos[simbolo]).length === 0) {
               //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                console.log(`[PASSO] Passou por limparGatilho 2 ${simbolo} <>  ${tipo} - logger.iniciado: ${global.logger?.iniciado}`);
               //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                delete this.gatilhosAtivos[simbolo];
            }
        }
    }

    static verificarEstadoGeral() {
        const agora = Date.now();
        let estadoGeral = 'NORMAL';

        for (const [simbolo, gatilhos] of Object.entries(this.gatilhosAtivos)) {
            for (const [tipo, evento] of Object.entries(gatilhos)) {
                // Se algum gatilho tem menos de 5 minutos
                if (agora - evento.timestamp < 300000) {
                    estadoGeral = 'ALERTA';
                    
                    // Se múltiplos gatilhos recentes
                    if (Object.keys(gatilhos).length > 2) {
                        estadoGeral = 'EMERGÊNCIA';
                        break;
                    }
                }
            }
        }

        return estadoGeral;
    }
}

    // Inicializar gatilhos para todos os pares ativos
    global.PARES_ATIVOS.forEach(par => {
        SistemaEmergencia.gatilhosAtivos[par] = {};
    });

// ====================== PAINEL DE CONTROLE ======================
class PainelControle {
  static obterDadosPainel(estados) {
     const painel = {};

    for (const simbolo of Object.keys(estados)) {
      const estado = estados[simbolo];
      const moedaBase = simbolo.replace('USDT', '');

      painel[simbolo] = {
        timestamp: Utils.formatarTimestamp(estado.healthCheck.ultimaConexao),
        saldoUSDT: estado.saldos?.USDT || 0,
        saldoCrypto: estado.saldos?.[moedaBase] || 0,
        precoAtual: estado.precoAtual,
        lucroAcumulado: estado.lucroAcumulado,
        tradesHoje: estado.tradesHoje,
        modoRecuperacao: estado.modoRecuperacao,
        benchmarkBTC: estado.benchmarkBTC,
        status: estado.emOperacao ? 'Operando' : 'Aguardando',
        ultimoErro: estado.ultimoErro,
        performanceStats: estado.performanceStats,
        liquidez: estado.liquidez,
        volumeDinamico: GerenciamentoRisco.calcularVolumeDinamico(simbolo, estado),
        metaHoraria: estado.metaHoraria,
        progressoHorario: estado.progressoHorario,
        lucroHorario: estado.lucroHorario,
        ultimoPrecoSolicitado: estado.ultimoPrecoSolicitado,
        ultimoPrecoExecutado: estado.ultimoPrecoExecutado
      };
    }

    return painel;
  }

  static async iniciar(estados) {
    const host = '127.0.0.1';
    const porta = await getFreePort({ min: 8880, max: 8890, host });

    const server = http.createServer((req, res) => {
      try {
        // Rota para dados JSON
        if (req.url === '/json') {
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(JSON.stringify(this.obterDadosPainel(estados)));
        }

        // Rota principal (HTML)
        let html = `
        <html>
        <head>
          <title>Crypto Bot - Painel de Controle</title>
          <meta http-equiv="refresh" content="5">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
            h1 { color: #333; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 2px 3px rgba(0,0,0,0.1); }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #4CAF50; color: white; }
            tr:hover { background-color: #f1f1f1; }
            .operando { color: green; font-weight: bold; }
            .aguardando { color: #E74C3C; font-weight: bold; }
            .recuperacao { background-color: #FFF3CD; }
            .header { display: flex; justify-content: space-between; align-items: center; }
            .last-update { color: #777; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Crypto Bot - Painel de Controle</h1>
            <div class="last-update">Atualizado em: ${new Date().toLocaleTimeString()}</div>
          </div>
          <p><a href="/json">Ver dados completos em JSON</a></p>
          <table>
            <tr>
              <th>Par</th>
              <th>Preço</th>
              <th>Saldo USDT</th>
              <th>Saldo Crypto</th>
              <th>Status</th>
              <th>Trades Hoje</th>
              <th>Lucro</th>
            </tr>`;

        for (const simbolo of Object.keys(estados)) {
          const estado = estados[simbolo];
          const moedaBase = simbolo.replace('USDT', '');
          const saldoCrypto = estado.saldos?.[moedaBase] || 0;
          
          html += `
          <tr ${estado.modoRecuperacao ? 'class="recuperacao"' : ''}>
            <td>${simbolo}</td>
            <td>${estado.precoAtual?.toFixed(2) || '0.00'}</td>
            <td>${estado.saldos?.USDT?.toFixed(2) || '0.00'}</td>
            <td>${saldoCrypto.toFixed(6)} ${moedaBase}</td>
            <td class="${estado.emOperacao ? 'operando' : 'aguardando'}">
              ${estado.emOperacao ? '🟢 Operando' : '🔴 Aguardando'}
            </td>
            <td>${estado.tradesHoje}/${config.MAX_TRADES_DIA}</td>
            <td>${estado.lucroAcumulado?.toFixed(2) || '0.00'} USDT</td>
          </tr>`;
        }

        html += `</table></body></html>`;
        
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(html);
      } catch (err) {
        res.writeHead(500);
        res.end('Erro interno no painel de controle');
      }
    });

    server.listen(porta, host, () => {
      console.log(chalk.green(`✅ Painel de controle iniciado em http://${host}:${porta}`));
    });

    return server;
  }
}

// ================== SINAIS ==================
class Sinais {
  static async obterSinais(par, estado) {
    try {
      // Verificação rigorosa dos parâmetros de entrada
      if (!par || typeof par !== 'string') {
        throw new Error('Símbolo do par inválido');
      }
      
      if (!estado || typeof estado !== 'object') {
        throw new Error('Estado do par inválido');
      }

      // Resultado padrão (fail-safe)
      const resultadoPadrao = {
        comprar: false,
        vender: false,
        forca: 0,
        confiabilidade: 0,
        indicadores: {}
      };

      // Adicione fallbacks para volumes
      estado.volumeAtual = estado.volumeAtual || 0;
      estado.mediaVolume = estado.mediaVolume || 1; // Evitar divisão por zero

      // 1. Verificar se os indicadores essenciais estão presentes
      const indicadoresRequeridos = ['precoAtual', 'rsi', 'macd', 'emaShort', 'emaLong', 'volumeAtual', 'mediaVolume'];
      const indicadoresFaltantes = indicadoresRequeridos.filter(ind => estado[ind] === undefined);
      
      if (indicadoresFaltantes.length > 0) {
        throw new Error(`Indicadores faltantes: ${indicadoresFaltantes.join(', ')}`);
      }

      // 2. Calcular sinais individuais
      const sinais = {
        rsiSobrevendido: estado.rsi < 30,
        rsiSobrecomprado: estado.rsi > 70,
        macdAlta: estado.macd > estado.sinalMacd,
        emaCruzamentoAlta: estado.emaShort > estado.emaLong,
        volumeAlto: estado.volumeAtual > estado.mediaVolume * 1.5,
        tendenciaAlta: estado.emaShort > estado.emaLong && estado.macd > estado.sinalMacd
      };

      // 3. Cálculo de força do sinal (0-100)
      let forca = 0;
      let contador = 0;
      
      if (sinais.rsiSobrevendido) { forca += 15; contador++; }
      if (sinais.macdAlta) { forca += 20; contador++; }
      if (sinais.emaCruzamentoAlta) { forca += 25; contador++; }
      if (sinais.volumeAlto) { forca += 20; contador++; }
      if (sinais.tendenciaAlta) { forca += 20; contador++; }
      
      // Ajustar força baseado no número de sinais confirmados
      forca = contador > 0 ? Math.min(100, forca * (1 + contador/10)) : 0;
      
      // 4. Cálculo de confiabilidade (baseado em volatilidade e consistência)
      const confiabilidade = Math.max(0, 70 - (estado.volatilidade * 10));
      
      // 5. Tendência do mercado (baseado em múltiplos timeframe)
      const tendencia = this.calcularTendencia(estado);

      // 6. Sinal de compra (requer múltiplas confirmações)
      const comprar = (
        sinais.rsiSobrevendido &&
        sinais.macdAlta &&
        sinais.emaCruzamentoAlta &&
        forca > 60 &&
        tendencia === 'ALTA'
      );

      // 7. Sinal de venda (mais sensível a sinais negativos)
      const vender = (
        sinais.rsiSobrecomprado ||
        (sinais.volumeAlto && !sinais.macdAlta) ||
        tendencia === 'BAIXA'
      );

      // 8. Suprimir sinais se o mercado estiver lateral
      if (estado.tendencia === 'LATERAL' && forca < 75) {
        resultadoPadrao.comprar = false;
        resultadoPadrao.vender = false;
        return resultadoPadrao;
      }

      // 9. Resultado final
      return {
        comprar,
        vender,
        forca: Math.round(forca),
        confiabilidade: Math.round(confiabilidade),
        tendencia,
        indicadores: sinais,
        timestamp: Date.now(),
        par
      };

    } catch (err) {
      // Sistema de fallback seguro
      console.error(`[Sinais] Erro ao obter sinais para ${par}: ${err.message}`);
      
      return {
        comprar: false,
        vender: false,
        forca: 0,
        confiabilidade: 0,
        indicadores: {},
        erro: err.message,
        timestamp: Date.now(),
        par
      };
    }
  }

  static calcularTendencia(estado) {
    // Implementação robusta de detecção de tendência
    const pesoCurtoPrazo = 0.4;
    const pesoMedioPrazo = 0.35;
    const pesoLongoPrazo = 0.25;
    
    let score = 0;
    
    // Tendência de curto prazo (5-15 minutos)
    if (estado.ema5 > estado.ema15) score += pesoCurtoPrazo * 100;
    
    // Tendência de médio prazo (15-60 minutos)
    if (estado.ema15 > estado.ema60) score += pesoMedioPrazo * 100;
    
    // Tendência de longo prazo (1-4 horas)
    if (estado.ema60 > estado.ema240) score += pesoLongoPrazo * 100;
    
    // Classificação final
    if (score >= 70) return 'ALTA';
    if (score <= 30) return 'BAIXA';
    return 'LATERAL';
  }
}

// ====================== APRENDIZADO IA ======================
  class AprendizadoIA {
  static rede = new brain.NeuralNetwork({
    activation: 'relu',
    hiddenLayers: [8, 6],
    learningRate: 0.01,
  });

  static async treinarComCSV(caminhoCSV) {
    try {
      const conteudo = await fs.readFile(caminhoCSV, 'utf8');
      const linhas = conteudo.trim().split('\n').slice(1);
      const dados = linhas.map(linha => {
        try {
          const [_, tipo, preco, qtd, taxa, rsi, emaShort, emaLong, macd, signal, histogram, atr] = linha.split(',');

          const lucro = tipo === 'venda' ? (parseFloat(preco) * parseFloat(qtd)) - parseFloat(taxa) : 0;

          const input = {
             rsi: parseFloat(rsi) / 100,
             atr: parseFloat(atr) / 1000,
             macd: parseFloat(macd),
             histogram: parseFloat(histogram),
             spread: (parseFloat(emaShort) - parseFloat(emaLong)) / parseFloat(emaLong)
          };

          const output = {
             sucesso: lucro > 0 ? 1 : 0
          };

        if (Object.values(input).some(v => isNaN(v))) return null;

          return { input, output };
      } catch (e) {
         return null;
        }
      }).filter(x => x !== null);

      if (dados.length < 20) {
        console.warn(chalk.yellow('⚠️ Poucos dados válidos no CSV. IA pode ser imprecisa.'));
      }

      if (dados.length === 0) {
        console.error(chalk.red('❌ Nenhum dado válido para treinar a IA.'));
        return;
      }

      this.rede.train(dados, { iterations: 2000 });
      console.log(chalk.green('🧠 Rede neural treinada com sucesso!'));

    } catch (err) {
      console.error(chalk.red('Erro ao treinar IA:'), err.message);
    }
  }

  static avaliarCondicoes(estado) {
    if (!this.rede) {
      console.warn(chalk.yellow('⚠️ Rede neural ainda não foi treinada.'));
      return false;
    }

    try {
      const entrada = {
        rsi: estado.rsi / 100,
        atr: estado.atr / 1000,
        macd: estado.macd?.macd ?? 0,
        histogram: estado.macd?.histogram ?? 0,
        spread: (estado.emaShort - estado.emaLong) / (estado.emaLong || 1)
      };

      const valores = Object.values(entrada);
      if (valores.some(v => isNaN(v))) {
        console.warn(chalk.yellow('⚠️ Entrada inválida para IA. Dados incompletos.'));
        return false;
      }

      const resultado = this.rede.run(entrada);
      return resultado.sucesso >= 0.65;
    } catch (err) {
      console.error(chalk.red('Erro ao avaliar condições na IA:'), err.message);
      return false;
    }
  }

  static async obterCSVMaisRecente() {
    try {
      const logsDir = path.join(process.cwd(), 'LOGS');
      const arquivos = await fs.readdir(logsDir);

      const csvs = arquivos
        .filter(f => f.startsWith('trades_') && f.endsWith('.csv'))
        .map(f => ({
          nome: f,
          caminho: path.join(logsDir, f)
        }));

      const arquivosComData = await Promise.all(csvs.map(async file => {
        const stat = await fs.stat(file.caminho);
        return { ...file, mtime: stat.mtimeMs };
      }));

      arquivosComData.sort((a, b) => b.mtime - a.mtime);
      return arquivosComData[0]?.caminho || null;

    } catch (err) {
      console.error(chalk.red('Erro ao localizar CSV mais recente:'), err.message);
      return null;
    }
  }
}

// ====================== LOOP PRINCIPAL MULTI-PAR ======================
(async () => {
  // 1. Primeiro, carregar e processar os pares ativos do .env
  const PARES_ATIVOS = (process.env.ATIVOS || 'BTCUSDT,ETHUSDT,SOLUSDT')
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => p.endsWith('USDT')); // Garantir que só pares USDT são usados

  global.PARES_ATIVOS = PARES_ATIVOS;

  // 2. Extrair moedas base dos pares
  const MOEDAS_BASE = PARES_ATIVOS.map(par => par.replace('USDT', ''));
  
  // 3. Inicializar o bot
  const bot = new BotAgressivo();
  await bot.inicializarBot();

  //  const paresAtivos = PARES_ATIVOS; // Define a variável global
  global.estados = {};
  const estados = global.estados;

  // Config centralizada (use SEMPRE "config")
  const config = {
    USE_AI: process.env.USE_AI === 'true',
    USE_TESTNET: process.env.USE_TESTNET === 'true',
    SIMULA: process.env.SIMULA === 'true',
    INTERVALO: parseInt(process.env.INTERVALO, 10) || 1000,
    META_DIARIA_USDT: parseFloat(process.env.META_DIARIA_USDT) || 50,
    SALDO_INICIAL_USDT: parseFloat(process.env.SALDO_INICIAL_USDT) || 1000,
    SALDO_INICIAL_BTC: parseFloat(process.env.SALDO_INICIAL_BTC || '0'),
    SALDO_INICIAL_ETH: parseFloat(process.env.SALDO_INICIAL_ETH || '0'),
    SALDO_INICIAL_SOL: parseFloat(process.env.SALDO_INICIAL_SOL || '0'),
    SALDO_INICIAL_BNB: parseFloat(process.env.SALDO_INICIAL_BNB || '0'),
    PARES_ATIVOS: PARES_ATIVOS,
    MOEDAS_BASE: MOEDAS_BASE
  };

  // 5. Carregar saldos iniciais dinamicamente para as moedas dos pares ativos
  config.SALDOS_INICIAIS = {};

  MOEDAS_BASE.forEach(moeda => {
  // Tentar encontrar saldo específico para a moeda
  const saldoEspecifico = process.env[`SALDO_INICIAL_${moeda}`];
  
  // Se não encontrou, tentar saldo padrão
  const saldoPadrao = process.env.SALDO_INICIAL_CRYPTO;
  
  // Usar o valor específico, ou padrão, ou zero
  config.SALDOS_INICIAIS[moeda] = saldoEspecifico ? 
    parseFloat(saldoEspecifico) : 
    (saldoPadrao ? parseFloat(saldoPadrao) : 0);
  });

  // 6. Configurações específicas por moeda (precisão, tamanho mínimo de ordem)
  config.PRECISAO = {};
  config.MIN_ORDER = {};

  MOEDAS_BASE.forEach(moeda => {
    // Precisão decimal (casas após a vírgula)
    config.PRECISAO[moeda] = parseInt(process.env[`PRECISAO_${moeda}`]) || 
                             parseInt(process.env.PRECISAO_PADRAO) || 6;
    
    // Tamanho mínimo de ordem
    config.MIN_ORDER[moeda] = parseFloat(process.env[`MIN_ORDER_${moeda}`]) || 
                              parseFloat(process.env.MIN_ORDER_PADRAO) || 0.001;
  });

  // 7. Tornar a configuração globalmente acessível
  global.config = config;

  // 3. Variáveis de controle
  let ultimoBenchmark = Date.now();
  let ultimaOtimizacao = Date.now();
  let ultimohealthCheck = Date.now();
  let ultimaVerificacaoEmergencia = Date.now();
  let ultimoResetErros = Date.now();

  // 4. Inicialização da IA
  const tradingAI = config.USE_AI ? new TradingAI() : null;
  let iaTreinada = false;
  
  if (tradingAI) {
    try {
      await tradingAI.trainModel();
      iaTreinada = true;
      await global.logger.log("✅ IA treinada com sucesso", "INFO");
    } catch (err) {
      await global.logger.log(`⚠️ IA não treinada: ${err.message}`, "AVISO");
    }
  }

  try {
    // 5. Inicialização do logger
    await global.logger.inicializar();
    await global.logger.log("============ INÍCIO DO BOT ============", "INFO");
    await global.logger.log(`Ambiente: ${config.SIMULA ? 'SIMULAÇÃO' : config.USE_TESTNET ? 'TESTNET' : 'MAINNET'}`, "INFO");
    
    // Inicialização de pares
    for (const par of global.PARES_ATIVOS) {
      console.log(`[${par}] Inicializando estado...`);
      try {
        estados[par] = new estadoPar(par);
        const moedaBase = global.getMoedaBase(par);
        
        if (config.SIMULA) {
          estados[par].saldos.USDT = config.SALDO_INICIAL_USDT || 1000;
          estados[par].saldos[moedaBase] = config[`SALDO_INICIAL_${moedaBase}`] || 0;
        } else {
          estados[par].saldos.USDT = await ConexaoAPI.obterSaldo('USDT', estados[par]) || 0;
          estados[par].saldos[moedaBase] = await ConexaoAPI.obterSaldo(moedaBase, estados[par]) || 0;
        }

        const { price, ultimaConexao } = await ConexaoAPI.obterPrecoAtual(par);
        const preco = Number(price);

        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
        console.log(`[PASSO] Passou por async ()   ${par}  <>  ${moedaBase}  <>  ${price}  <>  ${preco}- logger.iniciado: ${global.logger?.iniciado}`);
        //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

        if (isNaN(preco)) {
          await global.logger.log(`[${par}] Preço inválido na inicialização: ${preco}`, 'ERRO');
          continue;
        }

        estados[par].precoAtual = preco;
        estados[par].healthCheck.ultimaConexao = ultimaConexao || new Date().toISOString();
        estados[par].historicoPrecos = [preco];

        estados[par].rsi = 50;
        estados[par].macd = { MACD: 0, signal: 0, histograma: 0 };
        estados[par].emaShort = preco;
        estados[par].emaLong = preco;
        estados[par].atr = 0;
        estados[par].volatilidade = 0;
        estados[par].tendencia = 'neutra';
        estados[par].modoRecuperacao = false;
        estados[par].emOperacao = false;
        estados[par].stopMovel = 0;
        estados[par].metaDiaria = config.META_DIARIA_USDT;
        estados[par].metaHoraria = estados[par].metaDiaria / 24;

        // Inicializar preço de referência
        estados[par].precoRef = preco;

        await global.logger.log(
          `[${par}] Inicializado | Preço: ${preco} | Saldo: ${estados[par].saldos?.USDT} USDT, ` +
          `${estados[par].saldos?.[moedaBase]} ${moedaBase}`,
          'INFO'
        );
      } catch (err) {
        await global.logger.log(`[${par}] Falha inicialização: ${err.message}`, 'ERRO');

        // Fallback de emergência
        const fallback = new estadoPar(par);
        fallback.reset?.();
        estados[par] = fallback;
      }
    }

      PainelControle.iniciar(estados);
      await global.logger.log("🚀 Iniciando loop principal multi-par...", "INFO");

      // 3️⃣ Loop principal
      while (true) {
        const inicioLoop = Date.now();

        for (const par of global.PARES_ATIVOS) {
          const e = estados[par];
              try {
                    // Atualização básica de dados
                    const { price, ultimaConexao } = await ConexaoAPI.obterPrecoAtual(par);

                    if (price === undefined || isNaN(Number(price))) {
                        await global.logger.log(`[${par}] Preço inválido recebido em obterPrecoAtual: ${price}`, "ERRO");
                        return; // evita corromper o estado
                    }
                    
                    // garantir que seja número
                    e.precoAtual = Number(price);
                    e.healthCheck.ultimaConexao = ultimaConexao;

                    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                    console.log(`[PASSO] Passou por async() ${e.precoAtual}  <>  ${price}- logger.iniciado: ${global.logger?.iniciado}`);
                    //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%

                    // Atualizar histórico apenas se for número válido
                    if (!isNaN(e.precoAtual)) {
                        e.historicoPrecos.push(e.precoAtual);
                        if (e.historicoPrecos.length > 100) e.historicoPrecos.shift();
                    }
                    e.volume24h = await ConexaoAPI.obterVolumeComFallback(par, e);

                    // Atualizar histórico
                    e.historicoPrecos.push(e.precoAtual);
                    if (e.historicoPrecos.length > 100) e.historicoPrecos.shift();
                    
                    // Calcular indicadores
                    e.rsi = Indicadores.calcRSI(e.historicoPrecos);
                    Indicadores.updateMACD(e);
                    e.atr = Indicadores.calcATR(e.historicoPrecos);
                    e.volatilidade = Indicadores.calcVolatilidade(e.historicoPrecos);
                    e.tendencia = Indicadores.determinarTendencia(e.emaShort, e.emaLong, e.macd);

                    // ✅ Decisões de entrada/saída - CORREÇÃO
                    if (!e.emOperacao && Indicadores.deveComprar(e)) {
                        console.log(`[${par}] Sinal de compra detectado`);
                        
                        // Usar o método correto de ordem de compra
                        const quantidade = await GerenciamentoRisco.calcularTamanhoPosicao(par, e, e.precoAtual);
                        
                        if (quantidade > 0) {
                          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
                          console.log(`[PASSO] Passou por (Sinal de compra detectado) ${par}  <>  ${quantidade}  <>  ${e.precoAtual}  - logger.iniciado: ${global.logger?.iniciado}`);
                          //%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%$%%%%%
                            // Usar o método correto de ordem de compra
                            await Ordem.executarCompra(par, e, e.precoAtual, quantidade, 'SCALPING_ENTRADA');
                        }
                    } else if (e.emOperacao && Indicadores.deveVender(e)) {
                           console.log(`[${par}] Sinal de venda detectado`);
                      
                          // Usar o método correto de ordem de venda
                           await Ordem.executarVenda(par, e, e.precoAtual, null, 'SCALPING_SAIDA');
                    }

                    // 💾 Salvar o estado atualizado
                    await salvarEstado(par, e);

                    // 🔄 COLETAR DADOS PARA IA (ADICIONADO AQUI)
                    if (tradingAI) {
                          await tradingAI.coletarDados(e); 

                          // 🔄 DECISÃO DA IA (ADICIONADO AQUI)
                          if (iaTreinada) {
                              const decisaoIA = tradingAI.makeDecision(e);                

                              if (decisaoIA) {
                              
                                  // Executar decisão da IA
                                  if (decisaoIA.action === 'BUY' && !e.emOperacao) {
                                      const quantidadeIA = (decisaoIA.suggestedAmount || 0) / e.precoAtual;
                                      await Ordem.executarCompra(par, e, e.precoAtual, quantidadeIA, 'IA');
                                      e.stopLoss = decisaoIA.stopLoss;
                                      e.takeProfit = decisaoIA.takeProfit;
                                  } else if (decisaoIA.action === 'SELL' && e.emOperacao) {
                                      await Ordem.executarVenda(par, e, e.precoAtual, null, 'IA');
                                  }
                              }
                          }    
                    }     

                    // Lógica de recuperação
                    if (e.modoRecuperacao && e.volatilidade < 0.01) {
                        await global.logger.log(
                          `[${par}] 🔶 Modo Recuperação + Baixa Volatilidade: Reduzindo exposição`,
                          "AVISO"
                        );
                        await GerenciamentoRisco.reduzirExposicao(par, e);
                        continue;
                    }

                  // Atualizar stops e metas
                    GerenciamentoRisco.atualizarStopMovel(par, e, e.precoAtual);
                    await GerenciamentoRisco.verificarMetaHorariaAgressiva(par, e);

                    // Estratégias de trading
                    await Scalping.verificarOportunidadesRapidas(e);
                    await Scalping.oportunidadeSuperRapida(e);
                    await Scalping.verificarReversao(e);
                    await GerenciamentoRisco.verificarCompraPiramidal(par, e);

                    // Verificação de proteções
                    const protecaoAtivada = await GerenciamentoRisco.verificarProtecoes(par, e, e.precoAtual);
                    if (protecaoAtivada) {
                      await salvarEstado(par, e);
                      Interface.mostrarStatusPar(par, e);
                      continue;
                    }

                    // 🔄 Atualiza volume e média de volume

                    // atualizamos APENAS o par atual:
                    const atualizacaoParcial = await ConexaoAPI.atualizarEstadoPar(par, e);

                    // mescla os campos calculados em 'e' (que é uma instância de estadoPar)
                    Object.assign(e, atualizacaoParcial);

                    // agora sim, persista
                    await salvarEstado(par, e);

                    // Sinais tradicionais
                    const sinais = await Sinais.obterSinais(par, e);

                    if (!estados[par].emOperacao && sinais.comprar) {
                      const usdt = estados[par].saldos?.USDT || 0;
                      const quantidadeSinal = usdt > 0 ? (usdt * 0.1) / estados[par].precoAtual : 0; // 10% do USDT como exemplo
                      if (quantidadeSinal > 0) {
                        await Ordem.executarCompra(par, estados[par], estados[par].precoAtual, quantidadeSinal, 'LOOP PRINIPAL');
                      }
                    } else if (estados[par].emOperacao && sinais.vender) {
                      await Ordem.executarVenda(par, estados[par], estados[par].precoAtual, null, 'LOOP PRINCIPAL');
                    }

                    await bot.processarPar(par, e);

                    Interface.mostrarStatusPar(par, e);

              } catch (err) {
                  e.healthCheck.totalErros++;
                  e.healthCheck.ultimoErro = new Date().toISOString();
                  await global.logger.log(`[${par}] Erro loop: ${err.message}\n${err.stack}`, 'ERRO');
                  process.exit(0);
//                  logErroDetalhado(err, 'Erro loop: (Loop Principal)');
              }
      }

      // 4️⃣ Tarefas comuns
      if (Date.now() - ultimoBenchmark > 1800000) {
        await BenchmarkCompetitivo.obterDesempenhoExterno(estados);
        ultimoBenchmark = Date.now();
      }
      if (Date.now() - ultimaOtimizacao > 3600000) {
        await OtimizadorEstrategia.ajustarParametros();
        ultimaOtimizacao = Date.now();
      }
      if (Date.now() - ultimaVerificacaoEmergencia > 300000) {
        for (const par of global.PARES_ATIVOS) {
          if (SistemaEmergencia.verificarGatilhos(par, estados[par])) {
            await SistemaEmergencia.ativarModoSeguranca(par, estados[par]);
          }
        }
        ultimaVerificacaoEmergencia = Date.now();
      }

      // 5️⃣ Estatísticas e salvamentos
      if (Date.now() - ultimohealthCheck > 300000) {
        for (const par of global.PARES_ATIVOS) {
          await estados[par].salvarEstado();
          await global.logger.salvarStats(par, estados[par]);
        }
        ultimohealthCheck = Date.now();
      }

      // 6️⃣ Reset parcial de contadores de erro
      if (Date.now() - ultimoResetErros > 3600000) {
        for (const par of global.PARES_ATIVOS) {
          estados[par].healthCheck.totalErros = Math.floor(estados[par].healthCheck.totalErros * 0.5);
        }
        await global.logger.log(`Reset parcial de contadores de erro`, "INFO");
        ultimoResetErros = Date.now();
      }

      // 7️⃣ Atualização dinâmica de metas
      for (const par of global.PARES_ATIVOS) {
        ProfitOptimizer.updateDailyTarget(par, estados[par]);
      }

      // Controle de tempo de execução
      const execTime = Date.now() - inicioLoop;
      const delay = Math.max(500, config.INTERVALO - execTime);
      await new Promise(r => setTimeout(r, delay));
    }
  } catch (fatalErr) {
    await global.logger.log(`❌ ERRO FATAL: ${fatalErr.message}`, "ERRO");
    process.exit(1);
  }
})();

export { BotAgressivo };

if (process.argv.includes('--forcar-teste')) {
  async function executarTesteForcado() {
    // 1. Inicializar manualmente o logger se necessário
    if (!global.logger) {
      global.logger = {
        log: console.log,
        salvarStats: () => console.log("✅ Stats salvos (simulado)")
      };
    }

    // 2. Criar estado de teste
    const estadoPar = {
      simbolo: 'BTCUSDT',
      saldos: {
        USDT: 1000,     // Saldo em USDT
        BTC: 0.5,       // Saldo em Bitcoin
        ETH: 0,         // Saldo em Ethereum
        SOL: 0          // Saldo em Solana
      },
      tradesHoje: 0,
      emOperacao: false,
      // Adicione outras propriedades necessárias aqui
    };

    // 3. Simular o módulo de ordens (se não estiver disponível)
    if (!global.Ordem) {
      global.Ordem = {
        executarCompra: async (simbolo, estado, preco, qtd, motivo) => {
          console.log(`[SIMULAÇÃO] COMPRA: ${qtd} ${simbolo} a ${preco} | Motivo: ${motivo}`);
          estado.saldos.USDT -= preco * qtd;
          estado.saldos.BTC += qtd;
        },
        executarVenda: async (simbolo, estado, preco, motivo) => {
          console.log(`[SIMULAÇÃO] VENDA: ${estado.saldos.BTC} ${simbolo} a ${preco} | Motivo: ${motivo}`);
          estado.saldos.USDT += preco * estado.saldos.BTC;
          estado.saldos.BTC = 0;
        }
      };
    }

    // 4. Executar teste
    const simbolo = 'BTCUSDT';
    const precoAtual = 117000;
    const qtd = 0.0005;

    console.log("Saldo inicial:", estadoPar.saldos);
    
    await global.Ordem.executarCompra(simbolo, estadoPar, precoAtual, qtd, 'FORCE TEST');
    console.log("Após compra:", estadoPar.saldos);
    
    await global.Ordem.executarVenda(simbolo, estadoPar, precoAtual * 1.005, null, 'FORCE TEST');
    console.log("Após venda:", estadoPar.saldos);

    console.log("✅ Teste de operação finalizado.");
    process.exit(0);
  }

  executarTesteForcado();
}



// ====================== HANDLERS DE DESLIGAMENTO ======================
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⛔ Encerrando bot...'));

  try {
      for (const par of global.PARES_ATIVOS) {
        const estado = estados[par];
//        await BotAgressivo.processarPar(par, estado);
      }

      if (estado.emOperacao) {
        await Promise.all(global.PARES_ATIVOS.map(async par => {
            const estado = this.estados[par];
            if (!estado?.emOperacao) return;

            try {
                const { price, ultimaConexao } = await ConexaoAPI.obterPrecoAtual(par);
                const preco = Number(price);

                if (isNaN(preco)) {
                    await global.logger.log(`[${par}] Preço inválido recebido na venda de shutdown: ${price}`, "ERRO");
                    return;
                }

                estado.precoAtual = preco;
                estado.healthCheck.ultimaConexao = ultimaConexao;

                // Atualizar histórico com número válido
                estado.historicoPrecos.push(preco);
                if (estado.historicoPrecos.length > 100) {
                    estado.historicoPrecos.shift();
                }

                if (preco > 0) {
                    console.log(chalk.bgYellow(`[${par}] Encerrando posição aberta...`));
                    await Ordem.executarVenda(par, estado, preco, null, 'SHUTDOWN VENDA');
                }
            } catch (err) {
                console.error(chalk.red(`[${par}] Erro crítico ao salvar:`), err);
                // Tentar salvar em local alternativo
                const tempFile = path.join(os.tmpdir(), `emergency_save_${par}_${Date.now()}.json`);
                await fs.writeFile(tempFile, JSON.stringify(estado));
                console.log(chalk.yellow(`[${par}] Estado salvo em: ${tempFile}`));
            }
        }));
      }

      await estado.salvarEstado(simbolo);
      await global.logger.salvarStats(simbolo, estado);
      await global.logger.salvarHistoricoDesempenho(simbolo, estado);
   

    console.log(chalk.green('✅ Todos estados e estatísticas salvos com sucesso.'));
  } catch (e) {
    console.error(chalk.red('Erro ao encerrar o bot:'), e.message);
  }

  process.exit(0);
  });


process.on('uncaughtException', async (err) => {
  console.error("Erro crítico não tratado:", err);

  for (const [simbolo, est] of Object.entries(Estado.estados)) {
    try {
      await est.salvarEstado();
    } catch (e) {
      console.error(`[${simbolo}] Falha ao salvar estado: ${e.message}`);
    }
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  await global.logger.log(`Promise rejeitada: ${reason}`, 'ERRO');
  console.error(chalk.red('Promise rejeitada não tratada:'), reason);
});