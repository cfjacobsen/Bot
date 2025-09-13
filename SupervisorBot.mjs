// supervisorbot.mjs
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ====================== CONFIGURAÇÃO INICIAL ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Modos de operação
const MODOS_OPERACAO = {
    SIMULA: 'simulacao',
    TESTNET: 'testnet',
    MAINNET: 'mainnet'
};

// ====================== DETECÇÃO AUTOMÁTICA DO MODO DE OPERAÇÃO ======================
function detectarModoOperacao() {
    const useTestnet = process.env.USE_TESTNET === 'true';
    const simula = process.env.SIMULA === 'true';
    
    if (useTestnet && simula) {
        console.log('[SUPERVISOR] Modo detectado: SIMULA (Testnet com saldo fixo)');
        return MODOS_OPERACAO.SIMULA;
    } else if (useTestnet && !simula) {
        console.log('[SUPERVISOR] Modo detectado: TESTNET (Testnet com saldo real)');
        return MODOS_OPERACAO.TESTNET;
    } else if (!useTestnet && !simula) {
        console.log('[SUPERVISOR] Modo detectado: MAINNET (Rede principal)');
        return MODOS_OPERACAO.MAINNET;
    } else {
        console.log('[SUPERVISOR] Modo não reconhecido, usando SIMULA como padrão');
        return MODOS_OPERACAO.SIMULA;
    }
}

// ====================== SISTEMA DE CONVERSAÇÃO ENTRE IAs ======================
class IAChat {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY;
        this.deepseekKey = process.env.DEEPSEEK_API_KEY;
        this.openaiURL = 'https://api.openai.com/v1/chat/completions';
        this.deepseekURL = 'https://api.deepseek.com/v1/chat/completions';
        this.historicoConversas = [];
    }

    async askChatGPT(messages, max_tokens = 1000) {
        if (!this.openaiKey) {
            console.error('OpenAI API key não configurada');
            return null;
        }

        try {
            const response = await axios.post(this.openaiURL, {
                model: 'gpt-4-turbo',
                messages: messages,
                max_tokens: max_tokens,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Erro ao consultar ChatGPT:', error.message);
            return null;
        }
    }

    async askDeepSeek(messages, max_tokens = 1000) {
        if (!this.deepseekKey) {
            console.error('DeepSeek API key não configurada');
            return null;
        }

        try {
            const response = await axios.post(this.deepseekURL, {
                model: 'deepseek-chat',
                messages: messages,
                max_tokens: max_tokens,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.deepseekKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Erro ao consultar DeepSeek:', error.message);
            return null;
        }
    }

    async analisarMercado(estadoPar, contexto = '') {
        const mensagemAnalise = `
        Analise o estado atual do mercado para o par ${estadoPar.simbolo}:
        
        DADOS ATUAIS:
        - Preço: ${estadoPar.precoAtual}
        - RSI: ${estadoPar.rsi}
        - EMA Curta: ${estadoPar.emaShort}
        - EMA Longa: ${estadoPar.emaLong}
        - MACD: ${JSON.stringify(estadoPar.macd)}
        - Volatilidade: ${(estadoPar.volatilidade * 100).toFixed(2)}%
        - Volume 24h: ${estadoPar.volume24h}
        - Tendência: ${estadoPar.tendencia}
        
        CONTEXTO ADICIONAL: ${contexto}
        
        Por favor, forneça:
        1. Análise técnica breve
        2. Recomendação de ação (COMPRAR, VENDER, MANTER, AGUARDAR, EMERGENCIA)
        3. Nível de confiança (0-100%)
        4. Previsão de curto prazo
        5. Possíveis ajustes de parámetros recomendados
        6. Identificação de condições de emergência
        `;

        const messages = [
            { role: 'system', content: 'Você é um analista de mercados financeiros especializado em criptomoedas e trading algorítmico. Identifique condições de emergência que possam impactar negativamente o desempenho.' },
            { role: 'user', content: mensagemAnalise }
        ];

        try {
            // Consultar ambas as IAs em paralelo
            const [respostaGPT, respostaDeepSeek] = await Promise.all([
                this.askChatGPT(messages),
                this.askDeepSeek(messages)
            ]);

            const analiseCombinada = {
                timestamp: new Date().toISOString(),
                simbolo: estadoPar.simbolo,
                chatgpt: respostaGPT,
                deepseek: respostaDeepSeek,
                consenso: this.extrairConsenso(respostaGPT, respostaDeepSeek),
                emergencia: this.detectarEmergencia(respostaGPT, respostaDeepSeek)
            };

            this.historicoConversas.push(analiseCombinada);
            
            // Manter apenas as últimas 100 análises
            if (this.historicoConversas.length > 100) {
                this.historicoConversas = this.historicoConversas.slice(-100);
            }

            return analiseCombinada;
        } catch (error) {
            console.error('Erro na análise de mercado:', error);
            return null;
        }
    }

    detectarEmergencia(analiseGPT, analiseDeepSeek) {
        if (!analiseGPT && !analiseDeepSeek) return false;
        
        const termosEmergencia = [
            'emergencia', 'emergency', 'crash', 'colapso', 'queda livre',
            'panic', 'pânico', 'liquidacao', 'liquidation', 'black swan',
            'cisne negro', 'manipulacao', 'manipulation', 'hack', 'ataque',
            'flash crash', 'interrupcao', 'outage', 'problema grave',
            'perigo iminente', 'alto risco', 'extreme risk'
        ];
        
        const textoCompleto = (analiseGPT || '') + ' ' + (analiseDeepSeek || '');
        const textoLower = textoCompleto.toLowerCase();
        
        // Verificar se há termos de emergência
        const temTermosEmergencia = termosEmergencia.some(termo => 
            textoLower.includes(termo.toLowerCase())
        );
        
        // Verificar se há recomendação de emergência explícita
        const temRecomendacaoEmergencia = textoLower.includes('emergencia') || 
                                        textoLower.includes('emergency');
        
        return temTermosEmergencia || temRecomendacaoEmergencia;
    }

    extrairConsenso(analiseGPT, analiseDeepSeek) {
        if (!analiseGPT || !analiseDeepSeek) {
            return {
                acao: 'MANTER',
                confianca: 0,
                motivo: 'Não foi possível obter análise das IAs',
                ajustesRecomendados: {}
            };
        }

        // Extrair ações recomendadas
        const acoesGPT = this.extrairAcao(analiseGPT);
        const acoesDeepSeek = this.extrairAcao(analiseDeepSeek);
        
        // Extrair ajustes de parâmetros
        const ajustesGPT = this.extrairAjustes(analiseGPT);
        const ajustesDeepSeek = this.extrairAjustes(analiseDeepSeek);
        
        // Determinar ação consensual
        let acaoConsenso = 'MANTER';
        let confiancaConsenso = 50;
        
        if (acoesGPT.acao === acoesDeepSeek.acao) {
            acaoConsenso = acoesGPT.acao;
            confiancaConsenso = (acoesGPT.confianca + acoesDeepSeek.confianca) / 2;
        } else if (acoesGPT.confianca >= 70 && acoesDeepSeek.confianca < 50) {
            acaoConsenso = acoesGPT.acao;
            confiancaConsenso = acoesGPT.confianca;
        } else if (acoesDeepSeek.confianca >= 70 && acoesGPT.confianca < 50) {
            acaoConsenso = acoesDeepSeek.acao;
            confiancaConsenso = acoesDeepSeek.confianca;
        }
        
        // Combinar ajustes recomendados
        const ajustesConsenso = { ...ajustesGPT, ...ajustesDeepSeek };
        
        return {
            acao: acaoConsenso,
            confianca: confiancaConsenso,
            motivo: `GPT: ${acoesGPT.motivo} | DeepSeek: ${acoesDeepSeek.motivo}`,
            ajustesRecomendados: ajustesConsenso
        };
    }

    extrairAcao(texto) {
        if (!texto) return { acao: 'MANTER', confianca: 50, motivo: 'Sem análise disponível' };
        
        const textoLower = texto.toLowerCase();
        
        let acao = 'MANTER';
        let confianca = 50;
        let motivo = 'Análise padrão';
        
        // Detectar ação recomendada
        if (textoLower.includes('comprar') || textoLower.includes('buy')) {
            acao = 'COMPRAR';
        } else if (textoLower.includes('vender') || textoLower.includes('sell')) {
            acao = 'VENDER';
        } else if (textoLower.includes('aguardar') || textoLower.includes('wait')) {
            acao = 'AGUARDAR';
        } else if (textoLower.includes('emergencia') || textoLower.includes('emergency')) {
            acao = 'EMERGENCIA';
        }
        
        // Detectar nível de confiança
        const confiancaMatch = textoLower.match(/(\d+)%|confiança.*(\d+)/);
        if (confiancaMatch) {
            confianca = parseInt(confiancaMatch[1] || confiancaMatch[2]) || 50;
        }
        
        // Extrair motivo breve
        const motivoMatch = texto.match(/motivo[:\s]*(.+?)(?=\.|$)|because[:\s]*(.+?)(?=\.|$)/i);
        if (motivoMatch) {
            motivo = (motivoMatch[1] || motivoMatch[2] || '').substring(0, 100);
        }
        
        return { acao, confianca, motivo };
    }

    extrairAjustes(texto) {
        if (!texto) return {};
        
        const ajustes = {};
        const regex = /(RSI|EMA|MACD|volatilidade|stop loss|take profit)[\s\:\-]+(\d+\.?\d*)/gi;
        let match;
        
        while ((match = regex.exec(texto)) !== null) {
            const parametro = match[1].toLowerCase();
            const valor = parseFloat(match[2]);
            
            if (!isNaN(valor)) {
                ajustes[parametro] = valor;
            }
        }
        
        return ajustes;
    }

    async obterRecomendacaoConsolidada(estadoPar) {
        const analise = await this.analisarMercado(estadoPar);
        
        if (!analise) {
            return {
                acao: 'MANTER',
                confianca: 0,
                motivo: 'Não foi possível obret análise das IAs',
                ajustesRecomendados: {},
                emergencia: false
            };
        }

        return {
            ...analise.consenso,
            emergencia: analise.emergencia
        };
    }
}

// ====================== SISTEMA DE SUPERVISÃO AVANÇADO ======================
class SupervisorBot {
    constructor() {
        this.iaChat = new IAChat();
        this.modoOperacao = detectarModoOperacao();
        this.estatisticas = {
            erros: [],
            operacoes: [],
            paresMonitorados: {},
            desempenhoGeral: {
                totalOperacoes: 0,
                operacoesLucro: 0,
                operacoesPrejuizo: 0,
                lucroTotal: 0,
                prejuizoTotal: 0,
                drawdownMaximo: 0
            },
            mercado: {
                volatilidadeMedia: 0,
                tendenciaGeral: 'NEUTRA'
            }
        };
        
        this.ultimaAnalise = Date.now();
        this.intervaloAnalise = this.getIntervaloAnalisePorModo();
        this.arquivoLog = path.join(__dirname, 'supervisor_log.json');
        this.estadoMercado = {
            ultimaAtualizacao: 0,
            tendencia: 'NEUTRA',
            volatilidade: 0
        };
        
        this.diretorioEstadoBot = path.join(__dirname, 'estados_pares');
        this.diretorioRecomendacoes = path.join(__dirname, 'recomendacoes_pares');
        this.diretorioBackups = path.join(__dirname, 'backups');
        
        this.arquivoBotPrincipal = path.join(__dirname, 'bot_agressivo6.mjs');
        this.ultimoBackupValido = null;
        
        this.emergenciaAtiva = false;
        this.ultimaEmergencia = 0;
        
        // Inicializar monitoramento
        this.inicializarMonitoramento();
    }

    getIntervaloAnalisePorModo() {
        switch (this.modoOperacao) {
            case MODOS_OPERACAO.MAINNET:
                return 300000; // 5 minutos para mainnet
            case MODOS_OPERACAO.TESTNET:
                return 180000; // 3 minutos para testnet
            case MODOS_OPERACAO.SIMULA:
            default:
                return 60000; // 1 minuto para simulação
        }
    }

    // ====================== SISTEMA DE BACKUP ======================
    async criarBackup() {
        try {
            // Garantir que o diretório de backups existe
            await fs.mkdir(this.diretorioBackups, { recursive: true });
            
            // Ler o conteúdo atual do bot
            const conteudoBot = await fs.readFile(this.arquivoBotPrincipal, 'utf8');
            
            // Gerar nome do arquivo de backup com timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const nomeBackup = `bot_agressivo6_${timestamp}.bkp`;
            const caminhoBackup = path.join(this.diretorioBackups, nomeBackup);
            
            // Criar backup
            await fs.writeFile(caminhoBackup, conteudoBot, 'utf8');
            
            // Também atualizar o backup mais recente
            const caminhoBackupRecente = path.join(__dirname, 'bot_agressivo6.bkp');
            await fs.writeFile(caminhoBackupRecente, conteudoBot, 'utf8');
            
            this.ultimoBackupValido = caminhoBackup;
            
            console.log(`[SUPERVISOR] Backup criado: ${caminhoBackup}`);
            return caminhoBackup;
            
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao criar backup:', error);
            this.registrarErro({
                tipo: 'backup',
                erro: error.message,
                operacao: 'criar_backup'
            });
            return null;
        }
    }

    async restaurarBackup(caminhoBackup = null) {
        try {
            const backupParaRestaurar = caminhoBackup || this.ultimoBackupValido;
            
            if (!backupParaRestaurar) {
                console.error('[SUPERVISOR] Nenhum backup disponível para restauração');
                return false;
            }
            
            // Ler conteúdo do backup
            const conteudoBackup = await fs.readFile(backupParaRestaurar, 'utf8');
            
            // Restaurar para o arquivo principal
            await fs.writeFile(this.arquivoBotPrincipal, conteudoBackup, 'utf8');
            
            console.log(`[SUPERVISOR] Backup restaurado: ${backupParaRestaurar}`);
            
            // Criar um novo backup após restauração (para manter a cadeia de backups)
            await this.criarBackup();
            
            return true;
            
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao restaurar backup:', error);
            this.registrarErro({
                tipo: 'backup',
                erro: error.message,
                operacao: 'restaurar_backup',
                caminhoBackup: caminhoBackup
            });
            return false;
        }
    }

    async listarBackups() {
        try {
            await fs.mkdir(this.diretorioBackups, { recursive: true });
            const arquivos = await fs.readdir(this.diretorioBackups);
            
            return arquivos
                .filter(arquivo => arquivo.endsWith('.bkp'))
                .sort()
                .reverse(); // Mais recentes primeiro
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao listar backups:', error);
            return [];
        }
    }

    // ====================== MONITORAMENTO MULTI-PARES ======================
    async monitorarTodosPares() {
        try {
            // Garantir que os diretórios existes
            await fs.mkdir(this.diretorioEstadoBot, { recursive: true });
            await fs.mkdir(this.diretorioRecomendacoes, { recursive: true });
            
            // Listar todos os arquivos de estado de pares
            let arquivosEstado;
            try {
                arquivosEstado = await fs.readdir(this.diretorioEstadoBot);
            } catch (error) {
                console.log('[SUPERVISOR] Nenhum arquivo de estado encontrado.');
                return;
            }
            
            // Filtrar apenas arquivos JSON
            const arquivosPares = arquivosEstado.filter(arquivo => 
                arquivo.endsWith('.json') && arquivo.startsWith('estado_')
            );
            
            console.log(`[SUPERVISOR] Encontrados ${arquivosPares.length} pares para monitorar`);
            
            // Processar cada par em paralelo
            const processos = arquivosPares.map(arquivo => 
                this.processarPar(arquivo.replace('estado_', '').replace('.json', ''))
            );
            
            await Promise.all(processos);
            
            // Gerar análise consolidada após processar todos os pares
            await this.gerarAnaliseConsolidada();
            
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao monitorar pares:', error);
            this.registrarErro({
                tipo: 'monitoramento_pares',
                erro: error.message
            });
        }
    }

    async processarPar(simbolo) {
        try {
            const caminhoArquivo = path.join(this.diretorioEstadoBot, `estado_${simbolo}.json`);
            
            // Ler estado do par
            const dados = await fs.readFile(caminhoArquivo, 'utf8');
            const estadoPar = JSON.parse(dados);
            
            // Validar estado do par
            if (!this.validarEstadoPar(estadoPar, simbolo)) {
                console.log(`[SUPERVISOR] Estado inválido para o par ${simbolo}`);
                return;
            }
            
            // Atualizar estatísticas do par
            this.atualizarEstatisticasPar(estadoPar);
            
            // Obter recomendação das IAs
            let recomendacao = null;
            if (process.env.OPENAI_API_KEY && process.env.DEEPSEEK_API_KEY) {
                recomendacao = await this.iaChat.obterRecomendacaoConsolidada(estadoPar);
                
                // Verificar condição de emergência
                if (recomendacao.emergencia) {
                    console.log(`[SUPERVISOR] EMERGÊNCIA detectada no par ${simbolo}!`);
                    await this.tratarEmergencia(simbolo, recomendacao, estadoPar);
                }
            }
            
            // Salvar recomendação
            await this.salvarRecomendacaoPar(simbolo, recomendacao, estadoPar);
            
            console.log(`[SUPERVISOR] Par ${simbolo} processado com sucesso`);
            
        } catch (error) {
            console.error(`[SUPERVISOR] Erro ao processar par ${simbolo}:`, error);
            this.registrarErro({
                tipo: 'processamento_par',
                simbolo: simbolo,
                erro: error.message
            });
        }
    }

    validarEstadoPar(estadoPar, simbolo) {
        const camposObrigatorios = [
            'simbolo', 'precoAtual', 'rsi', 'emaShort', 
            'emaLong', 'volatilidade', 'volume24h', 'tendencia'
        ];
        
        for (const campo of camposObrigatorios) {
            if (estadoPar[campo] === undefined || estadoPar[campo] === null) {
                console.error(`[SUPERVISOR] Campo ${campo} ausente no par ${simbolo}`);
                return false;
            }
        }
        
        return true;
    }

    atualizarEstatisticasPar(estadoPar) {
        const { simbolo } = estadoPar;
        
        // Inicializar estatísticas do par se não existirem
        if (!this.estatisticas.paresMonitorados[simbolo]) {
            this.estatisticas.paresMonitorados[simbolo] = {
                totalOperacoes: 0,
                operacoesLucro: 0,
                operacoesPrejuizo: 0,
                lucroTotal: 0,
                prejuizoTotal: 0,
                ultimaAtualizacao: Date.now(),
                historicoRecomendacoes: []
            };
        }
        
        // Atualizar estatísticas do par
        const estatisticasPar = this.estatisticas.paresMonitorados[simbolo];
        estatisticasPar.ultimaAtualizacao = Date.now();
        estatisticasPar.ultimoEstado = estadoPar;
        
        // Atualizar estatísticas gerais
        if (estadoPar.operacoes) {
            estatisticasPar.totalOperacoes += estadoPar.operacoes.total || 0;
            estatisticasPar.operacoesLucro += estadoPar.operacoes.lucro || 0;
            estatisticasPar.operacoesPrejuizo += estadoPar.operacoes.prejuizo || 0;
            estatisticasPar.lucroTotal += estadoPar.operacoes.lucroTotal || 0;
            estatisticasPar.prejuizoTotal += estadoPar.operacoes.prejuizoTotal || 0;
            
            this.estatisticas.desempenhoGeral.totalOperacoes += estadoPar.operacoes.total || 0;
            this.estatisticas.desempenhoGeral.operacoesLucro += estadoPar.operacoes.lucro || 0;
            this.estatisticas.desempenhoGeral.operacoesPrejuizo += estadoPar.operacoes.prejuizo || 0;
            this.estatisticas.desempenhoGeral.lucroTotal += estadoPar.operacoes.lucroTotal || 0;
            this.estatisticas.desempenhoGeral.prejuizoTotal += estadoPar.operacoes.prejuizoTotal || 0;
        }
    }

    async salvarRecomendacaoPar(simbolo, recomendacao, estadoPar) {
        try {
            const dadosRecomendacao = {
                timestamp: new Date().toISOString(),
                simbolo: simbolo,
                recomendacao: recomendacao,
                estadoPar: estadoPar,
                estadoMercado: this.estadoMercado
            };
            
            const caminhoArquivo = path.join(this.diretorioRecomendacoes, `recomendacao_${simbolo}.json`);
            await fs.writeFile(caminhoArquivo, JSON.stringify(dadosRecomendacao, null, 2), 'utf8');
            
            // Adicionar ao histórico de recomendações do par
            if (this.estatisticas.paresMonitorados[simbolo]) {
                this.estatisticas.paresMonitorados[simbolo].historicoRecomendacoes.push({
                    timestamp: new Date().toISOString(),
                    recomendacao: recomendacao
                });
                
                // Manter apenas as últimas 50 recomendações
                if (this.estatisticas.paresMonitorados[simbolo].historicoRecomendacoes.length > 50) {
                    this.estatisticas.paresMonitorados[simbolo].historicoRecomendacoes = 
                        this.estatisticas.paresMonitorados[simbolo].historicoRecomendacoes.slice(-50);
                }
            }
            
        } catch (error) {
            console.error(`[SUPERVISOR] Erro ao salvar recomendação para ${simbolo}:`, error);
            this.registrarErro({
                tipo: 'salvar_recomendacao',
                simbolo: simbolo,
                erro: error.message
            });
        }
    }

    async gerarAnaliseConsolidada() {
        try {
            const paresAtivos = Object.keys(this.estatisticas.paresMonitorados);
            
            if (paresAtivos.length === 0) {
                console.log('[SUPERVISOR] Nenhum par ativo para análise consolidada');
                return;
            }
            
            // Calcular métricas consolidadas
            const totalOperacoes = this.estatisticas.desempenhoGeral.totalOperacoes;
            const operacoesLucro = this.estatisticas.desempenhoGeral.operacoesLucro;
            const taxaAcerto = totalOperacoes > 0 ? (operacoesLucro / totalOperacoes) * 100 : 0;
            const lucroLiquido = this.estatisticas.desempenhoGeral.lucroTotal - 
                                this.estatisticas.desempenhoGeral.prejuizoTotal;
            
            // Identificar pares com melhor e pior desempenho
            const paresComDesempenho = paresAtivos.map(simbolo => {
                const estatisticas = this.estatisticas.paresMonitorados[simbolo];
                const taxaAcertoPar = estatisticas.totalOperacoes > 0 ? 
                    (estatisticas.operacoesLucro / estatisticas.totalOperacoes) * 100 : 0;
                const lucroLiquidoPar = estatisticas.lucroTotal - estatisticas.prejuizoTotal;
                
                return {
                    simbolo,
                    taxaAcerto: taxaAcertoPar,
                    lucroLiquido: lucroLiquidoPar,
                    totalOperacoes: estatisticas.totalOperacoes
                };
            });
            
            // Ordenar por desempenho
            paresComDesempenho.sort((a, b) => b.lucroLiquido - a.lucroLiquido);
            
            const melhorPar = paresComDesempenho[0];
            const piorPar = paresComDesempenho[paresComDesempenho.length - 1];
            
            // Gerar relatório consolidado
            const relatorioConsolidado = {
                timestamp: new Date().toISOString(),
                totalPares: paresAtivos.length,
                desempenhoGeral: {
                    totalOperacoes: totalOperacoes,
                    operacoesLucro: operacoesLucro,
                    operacoesPrejuizo: this.estatisticas.desempenhoGeral.operacoesPrejuizo,
                    taxaAcerto: taxaAcerto.toFixed(2) + '%',
                    lucroTotal: this.estatisticas.desempenhoGeral.lucroTotal.toFixed(6),
                    prejuizoTotal: this.estatisticas.desempenhoGeral.prejuizoTotal.toFixed(6),
                    lucroLiquido: lucroLiquido.toFixed(6)
                },
                melhorPar: melhorPar,
                piorPar: piorPar,
                estadoMercado: this.estadoMercado,
                paresAtivos: paresAtivos
            };
            
            // Salvar relatório consolidado
            const caminhoArquivo = path.join(__dirname, 'analise_consolidada.json');
            await fs.writeFile(caminhoArquivo, JSON.stringify(relatorioConsolidado, null, 2), 'utf8');
            
            console.log('[SUPERVISOR] Análise consolidada gerada com sucesso');
            
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao gerar análise consolidada:', error);
            this.registrarErro({
                tipo: 'analise_consolidada',
                erro: error.message
            });
        }
    }

    // ====================== TRATAMENTO DE EMERGÊNCIAS ======================
    async tratarEmergencia(simbolo, recomendacao, estadoPar) {
        const agora = Date.now();
        
        // Evitar múltiplas emergências em curto período
        if (agora - this.ultimaEmergencia < 300000) { // 5 minutos
            console.log(`[SUPERVISOR] Emergência recente já tratada. Ignorando nova emergência.`);
            return;
        }
        
        this.emergenciaAtiva = true;
        this.ultimaEmergencia = agora;
        
        console.log(`[SUPERVISOR] TRATANDO EMERGÊNCIA no par ${simbolo}`);
        
        // Ações de emergência baseadas no modo de operação
        switch (this.modoOperacao) {
            case MODOS_OPERACAO.MAINNET:
                // Em mainnet, ações mais conservadoras
                await this.acionarProcedimentosEmergenciaMainnet(simbolo);
                break;
                
            case MODOS_OPERACAO.TESTNET:
                // Em testnet, ações moderadas
                await this.acionarProcedimentosEmergenciaTestnet(simbolo);
                break;
                
            case MODOS_OPERACAO.SIMULA:
            default:
                // Em simulação, apenas registrar
                await this.registrarEmergencia(simbolo, recomendacao, estadoPar);
                break;
        }
        
        // Notificar sobre a emergência (poderia ser integrado com Telegram, Email, etc.)
        await this.notificarEmergencia(simbolo, recomendacao);
    }

    async acionarProcedimentosEmergenciaMainnet(simbolo) {
        console.log(`[SUPERVISOR] Acionando procedimentos de emergência MAINNET para ${simbolo}`);
        
        // 1. Criar backup imediato
        await this.criarBackup();
        
        // 2. Parar operações no par específico (se possível)
        await this.suspenderPar(simbolo);
        
        // 3. Registrar a emergência
        this.registrarErro({
            tipo: 'emergencia_mainnet',
            simbolo: simbolo,
            severidade: 'ALTA',
            acao: 'Operações suspensas e backup criado'
        });
        
        // 4. Em mainnet, considerar notificações adicionais
        console.log(`[SUPERVISOR] EMERGÊNCIA MAINNET: Par ${simbolo} suspenso`);
    }

    async acionarProcedimentosEmergenciaTestnet(simbolo) {
        console.log(`[SUPERVISOR] Acionando procedimentos de emergência TESTNET para ${simbolo}`);
        
        // 1. Criar backup
        await this.criarBackup();
        
        // 2. Ajustar parâmetros para modo mais conservador
        await this.ajustarParametrosEmergencia(simbolo);
        
        // 3. Registrar a emergência
        this.registrarErro({
            tipo: 'emergencia_testnet',
            simbolo: simbolo,
            severidade: 'MEDIA',
            acao: 'Parâmetros ajustados para modo conservador'
        });
        
        console.log(`[SUPERVISOR] EMERGÊNCIA TESTNET: Par ${simbolo} em modo conservador`);
    }

    async registrarEmergencia(simbolo, recomendacao, estadoPar) {
        console.log(`[SUPERVISOR] Registrando emergência em SIMULAÇÃO para ${simbolo}`);
        
        this.registrarErro({
            tipo: 'emergencia_simulacao',
            simbolo: simbolo,
            severidade: 'BAIXA',
            recomendacao: recomendacao,
            estadoPar: estadoPar,
            acao: 'Apenas registro (modo simulação)'
        });
    }

    async notificarEmergencia(simbolo, recomendacao) {
        // Esta função pode ser expandida para enviar notificações
        // por Telegram, Email, SMS, etc.
        
        const mensagem = `
        🚨 EMERGÊNCIA DETECTADA 🚨
        
        Par: ${simbolo}
        Modo: ${this.modoOperacao}
        Timestamp: ${new Date().toISOString()}
        
        Recomendação: ${recomendacao.motivo}
        Ação: ${recomendacao.acao}
        Confiança: ${recomendacao.confianca}%
        
        Ações tomadas:
        ${this.modoOperacao === MODOS_OPERACAO.MAINNET ? '• Operações suspensas\n• Backup criado' : 
          this.modoOperacao === MODOS_OPERACAO.TESTNET ? '• Parâmetros ajustados\n• Backup criado' : 
          '• Apenas registro (modo simulação)'}
        `;
        
        console.log(`[SUPERVISOR] Notificação de emergência:\n${mensagem}`);
        
        // Aqui poderia ser implementado o envio para Telegram, Email, etc.
        // await this.enviarTelegram(mensagem);
        // await this.enviarEmail(mensagem);
    }

    async suspenderPar(simbolo) {
        try {
            // Criar arquivo de suspensão que o bot pode verificar
            const arquivoSuspensao = path.join(__dirname, 'suspensoes.json');
            let suspensoes = {};
            
            try {
                const dados = await fs.readFile(arquivoSuspensao, 'utf8');
                suspensoes = JSON.parse(dados);
            } catch (error) {
                // Arquivo não existe, será criado
            }
            
            // Suspender o par
            suspensoes[simbolo] = {
                timestamp: new Date().toISOString(),
                motivo: 'Emergência detectada pelo supervisor'
            };
            
            await fs.writeFile(arquivoSuspensao, JSON.stringify(suspensoes, null, 2), 'utf8');
            console.log(`[SUPERVISOR] Par ${simbolo} suspenso por emergência`);
            
        } catch (error) {
            console.error(`[SUPERVISOR] Erro ao suspender par ${simbolo}:`, error);
        }
    }

    async ajustarParametrosEmergencia(simbolo) {
        try {
            // Ler parâmetros atuais
            const arquivoParametros = path.join(__dirname, 'parametros.json');
            let parametros = {};
            
            try {
                const dados = await fs.readFile(arquivoParametros, 'utf8');
                parametros = JSON.parse(dados);
            } catch (error) {
                // Arquivo não existe, usar padrões
                parametros = {
                    RSI_COMPRA_MAX: 70,
                    RSI_VENDA_MIN: 30,
                    STOP_LOSS: 0.95,
                    TAKE_PROFIT: 1.05
                };
            }
            
            // Ajustar para modo conservador
            parametros.RSI_COMPRA_MAX = Math.min(parametros.RSI_COMPRA_MAX, 60);
            parametros.RSI_VENDA_MIN = Math.max(parametros.RSI_VENDA_MIN, 40);
            parametros.STOP_LOSS = Math.max(parametros.STOP_LOSS, 0.98);
            parametros.TAKE_PROFIT = Math.min(parametros.TAKE_PROFIT, 1.02);
            
            // Salvar parâmetros ajustados
            await fs.writeFile(arquivoParametros, JSON.stringify(parametros, null, 2), 'utf8');
            console.log(`[SUPERVISOR] Parâmetros ajustados para modo conservador no par ${simbolo}`);
            
        } catch (error) {
            console.error(`[SUPERVISOR] Erro ao ajustar parâmetros para ${simbolo}:`, error);
        }
    }

    // ====================== MONITORAMENTO DE MERCADO ======================
    async analisarMercadoGlobal() {
        const agora = Date.now();
        
        // Analisar apenas a cada 30 minutos
        if (agora - this.estadoMercado.ultimaAtualizacao < 1800000) {
            return this.estadoMercado;
        }

        try {
            // Simular análise de mercado
            const mensagem = `
            Analise o estado geral do mercado de criptomoedas considerando:
            - Volatilidade geral do mercado
            - Tendências predominantes
            - Eventos macroeconômicos recentes
            - Sentimento do mercado
            
            Forneça:
            1. Tendência geral (ALTA, BAIXA, NEUTRA)
            2. Nível de volatilidade (BAIXA, MEDIA, ALTA)
            3. Recomendações gerais para traders
            `;

            const messages = [
                { role: 'system', content: 'Você é um analista de mercados financeiros especializado em criptomoedas.' },
                { role: 'user', content: mensagem }
            ];

            const [respostaGPT, respostaDeepSeek] = await Promise.all([
                this.iaChat.askChatGPT(messages),
                this.iaChat.askDeepSeek(messages)
            ]);

            // Extrair informações das respostas
            const tendencia = respostaGPT?.includes('ALTA') ? 'ALTA' : 
                             respostaGPT?.includes('BAIXA') ? 'BAIXA' : 'NEUTRA';
            
            const volatilidade = respostaGPT?.includes('volatilidade ALTA') ? 'ALTA' :
                               respostaGPT?.includes('volatilidade BAIXA') ? 'BAIXA' : 'MEDIA';

            this.estadoMercado = {
                ultimaAtualizacao: agora,
                tendencia: tendencia,
                volatilidade: volatilidade,
                analiseGPT: respostaGPT?.substring(0, 200) + '...',
                analiseDeepSeek: respostaDeepSeek?.substring(0, 200) + '...'
            };

            return this.estadoMercado;
        } catch (error) {
            console.error('Erro na análise de mercado global:', error);
            return this.estadoMercado;
        }
    }

    // ====================== MONITORAMENTO DE ERROS ======================
    inicializarMonitoramento() {
        console.log(`[SUPERVISOR] Inicializando sistema de monitoramento em modo ${this.modoOperacao}...`);
        
        // Criar backup inicial
        this.criarBackup().then(() => {
            console.log('[SUPERVISOR] Backup inicial criado com sucesso');
        });
        
        // Monitorar rejeições de promessas não tratadas
        process.on('unhandledRejection', (reason, promise) => {
            this.registrarErro({
                tipo: 'unhandled_rejection',
                motivo: reason,
                stack: new Error().stack
            });
        });

        // Monitorar exceções não capturadas
        process.on('uncaughtException', (error) => {
            this.registrarErro({
                tipo: 'uncaught_exception',
                erro: error.message,
                stack: error.stack
            });
        });

        // Iniciar monitoramento periódico
        this.iniciarMonitoramentoPeriodico();
    }

    registrarErro(erroInfo) {
        const erroCompleto = {
            timestamp: new Date().toISOString(),
            ...erroInfo
        };

        this.estatisticas.erros.push(erroCompleto);
        
        // Manter apenas os últimos 1000 erros
        if (this.estatisticas.erros.length > 1000) {
            this.estatisticas.erros = this.estatisticas.erros.slice(-1000);
        }

        console.error('[SUPERVISOR] Erro registrado:', erroCompleto);
        return erroCompleto;
    }

    // ====================== MONITORAMENTO PERIÓDICO ======================
    iniciarMonitoramentoPeriodico() {
        // Monitorar a cada 5 minutos
        setInterval(() => {
            this.executarMonitoramento();
        }, 300000);

        console.log('[SUPERVISOR] Monitoramento periódico iniciado (intervalo: 5 minutos)');
    }

    async executarMonitoramento() {
        console.log('[SUPERVISOR] Executando monitoramento periódico...');
        
        try {
            // Atualizar análise de mercado global
            await this.analisarMercadoGlobal();
            
            // Monitorar todos os pares
            await this.monitorarTodosPares();
            
            // Verificar condições críticas
            this.verificarCondicoesCriticas();
            
            console.log('[SUPERVISOR] Monitoramento concluído');
        } catch (error) {
            console.error('[SUPERVISOR] Erro no monitoramento periódico:', error);
        }
    }

    verificarCondicoesCriticas() {
        // Verificar se há muitos erros recentes
        const errosRecentes = this.estatisticas.erros.filter(
            e => Date.now() - new Date(e.timestamp).getTime() < 3600000 // última hora
        );
        
        if (errosRecentes.length > 10) {
            console.log('[SUPERVISOR] Muitos erros recentes. Considerando intervenção...');
            this.registrarErro({
                tipo: 'condicao_critica',
                mensagem: 'Muitos erros detectados na última hora',
                quantidade: errosRecentes.length
            });
        }
        
        // Verificar se há pares com desempenho muito ruim
        const pares = Object.keys(this.estatisticas.paresMonitorados);
        for (const simbolo of pares) {
            const estatisticas = this.estatisticas.paresMonitorados[simbolo];
            const taxaAcerto = estatisticas.totalOperacoes > 0 ? 
                (estatisticas.operacoesLucro / estatisticas.totalOperacoes) * 100 : 0;
            
            if (taxaAcerto < 30 && estatisticas.totalOperacoes > 10) {
                console.log(`[SUPERVISOR] Par ${simbolo} com desempenho crítico: ${taxaAcerto.toFixed(2)}% de acerto`);
                this.registrarErro({
                    tipo: 'desempenho_critico',
                    simbolo: simbolo,
                    taxaAcerto: taxaAcerto,
                    totalOperacoes: estatisticas.totalOperacoes
                });
            }
        }
    }

    // ====================== INTERFACE COM O BOT PRINCIPAL ======================
    async processarEstadoPar(estadoPar) {
        // Validar estado do par
        if (!estadoPar || !estadoPar.simbolo) {
            console.error('[SUPERVISOR] Estado do par inválido');
            return null;
        }
        
        // Salvar estado do par para processamento
        await this.salvarEstadoPar(estadoPar);
        
        // Obter recomendação das IAs
        let recomendacao = null;
        if (process.env.OPENAI_API_KEY && process.env.DEEPSEEK_API_KEY) {
            recomendacao = await this.iaChat.obterRecomendacaoConsolidada(estadoPar);
        }
        
        // Analisar mercado global
        const estadoMercado = await this.analisarMercadoGlobal();
        
        return {
            estadoPar: estadoPar,
            recomendacao: recomendacao,
            estadoMercado: estadoMercado,
            timestamp: new Date().toISOString()
        };
    }

    async salvarEstadoPar(estadoPar) {
        try {
            // Garantir que o diretório existe
            await fs.mkdir(this.diretorioEstadoBot, { recursive: true });
            
            // Salvar estado do par
            const caminhoArquivo = path.join(this.diretorioEstadoBot, `estado_${estadoPar.simbolo}.json`);
            await fs.writeFile(caminhoArquivo, JSON.stringify(estadoPar, null, 2), 'utf8');
            
        } catch (error) {
            console.error(`[SUPERVISOR] Erro ao salvar estado do par ${estadoPar.simbolo}:`, error);
            this.registrarErro({
                tipo: 'salvar_estado_par',
                simbolo: estadoPar.simbolo,
                erro: error.message
            });
        }
    }

    // ====================== RELATÓRIOS E ESTATÍSTICAS ======================
    async gerarRelatorio() {
        try {
            const relatorio = {
                timestamp: new Date().toISOString(),
                desempenhoGeral: this.estatisticas.desempenhoGeral,
                estadoMercado: this.estadoMercado,
                paresMonitorados: Object.keys(this.estatisticas.paresMonitorados).length,
                errosRecentes: this.estatisticas.erros.slice(-5),
                detalhesPares: {}
            };
            
            // Adicionar detalhes de cada par
            for (const [simbolo, estatisticas] of Object.entries(this.estatisticas.paresMonitorados)) {
                const taxaAcerto = estatisticas.totalOperacoes > 0 ? 
                    (estatisticas.operacoesLucro / estatisticas.totalOperacoes) * 100 : 0;
                const lucroLiquido = estatisticas.lucroTotal - estatisticas.prejuizoTotal;
                
                relatorio.detalhesPares[simbolo] = {
                    taxaAcerto: taxaAcerto.toFixed(2) + '%',
                    lucroLiquido: lucroLiquido.toFixed(6),
                    totalOperacoes: estatisticas.totalOperacoes,
                    ultimaAtualizacao: new Date(estatisticas.ultimaAtualizacao).toISOString()
                };
            }
            
            // Salvar relatório em arquivo
            const nomeArquivo = `supervisor_relatorio_${Date.now()}.json`;
            const caminhoArquivo = path.join(__dirname, 'relatorios', nomeArquivo);
            
            await fs.mkdir(path.dirname(caminhoArquivo), { recursive: true });
            await fs.writeFile(caminhoArquivo, JSON.stringify(relatorio, null, 2), 'utf8');
            
            console.log('[SUPERVISOR] Relatório gerado:', caminhoArquivo);
            return relatorio;
        } catch (error) {
            console.error('[SUPERVISOR] Erro ao gerar relatório:', error);
            return null;
        }
    }
}

// ====================== INICIALIZAÇÃO DO SUPERVISOR ======================
const supervisor = new SupervisorBot();

// Adicionar ao global para acesso em outros módulos
global.supervisor = supervisor;

// Exportar a classe para uso em outros módulos
export default SupervisorBot;
export { MODOS_OPERACAO };