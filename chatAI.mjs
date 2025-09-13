// ====================== SISTEMA DE CONVERSAÇÃO ENTRE IAs ======================
class IAChat {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY;
        this.deepseekKey = process.env.DEEPSEEK_API_KEY;
        this.openaiURL = 'https://api.openai.com/v1/chat/completions';
        this.deepseekURL = 'https://api.deepseek.com/v1/chat/completions';
        this.historicoConversas = [];
    }

    async askChatGPT(messages, max_tokens = 500) {
        try {
            const response = await axios.post(this.openaiURL, {
                model: 'gpt-4',
                messages: messages,
                max_tokens: max_tokens,
                temperature: 0.7
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            await global.logger.log(`Erro ao consultar ChatGPT: ${error.message}`, "ERRO");
            return null;
        }
    }

    async askDeepSeek(messages, max_tokens = 500) {
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
                }
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            await global.logger.log(`Erro ao consultar DeepSeek: ${error.message}`, "ERRO");
            return null;
        }
    }

    async analisarMercado(estadoPar, contexto = '') {
        const mensagemAnalise = `
        Analise o estado atual do mercado para o par ${estadoPar.simbolo}:

        - Preço: ${estadoPar.precoAtual}
        - RSI: ${estadoPar.rsi}
        - EMA Curta: ${estadoPar.emaShort}
        - EMA Longa: ${estadoPar.emaLong}
        - MACD: ${JSON.stringify(estadoPar.macd)}
        - Volatilidade: ${(estadoPar.volatilidade * 100).toFixed(2)}%
        - Volume 24h: ${estadoPar.volume24h}
        - Tendência: ${estadoPar.tendencia}

        CONTEXTO: ${contexto}
        `;

        const messages = [
            { role: 'system', content: 'Você é um analista de criptomoedas agressivo e técnico.' },
            { role: 'user', content: mensagemAnalise }
        ];

        try {
            const [respostaGPT, respostaDeepSeek] = await Promise.all([
                this.askChatGPT(messages),
                this.askDeepSeek(messages)
            ]);

            const analiseCombinada = {
                timestamp: new Date().toISOString(),
                simbolo: estadoPar.simbolo,
                chatgpt: respostaGPT,
                deepseek: respostaDeepSeek,
                consenso: this.extrairConsenso(respostaGPT, respostaDeepSeek)
            };

            this.historicoConversas.push(analiseCombinada);
            if (this.historicoConversas.length > 100) {
                this.historicoConversas = this.historicoConversas.slice(-100);
            }

            return analiseCombinada;
        } catch (error) {
            await global.logger.log(`Erro na análise de mercado: ${error.message}`, "ERRO");
            return null;
        }
    }

    extrairConsenso(analiseGPT, analiseDeepSeek) {
        const gptAction = analiseGPT?.includes('COMPRAR') ? 'COMPRAR' : 
                         analiseGPT?.includes('VENDER') ? 'VENDER' : 'MANTER';
        const deepseekAction = analiseDeepSeek?.includes('COMPRAR') ? 'COMPRAR' : 
                             analiseDeepSeek?.includes('VENDER') ? 'VENDER' : 'MANTER';

        if (gptAction === deepseekAction) {
            return { acao: gptAction, confianca: 'ALTA', motivo: 'Consenso entre ambas as IAs' };
        } else {
            return { acao: 'MANTER', confianca: 'MEDIA', motivo: 'Divergência entre as IAs' };
        }
    }

    async obterRecomendacaoConsolidada(estadoPar) {
        const analise = await this.analisarMercado(estadoPar);
        if (!analise) return { acao: 'MANTER', confianca: 50, motivo: 'Falha nas IAs' };

        await global.logger.log(`[${estadoPar.simbolo}] GPT: ${analise.chatgpt?.substring(0,80)}...`, "INFO");
        await global.logger.log(`[${estadoPar.simbolo}] DeepSeek: ${analise.deepseek?.substring(0,80)}...`, "INFO");

        return analise.consenso;
    }
}

// Instanciar e disponibilizar globalmente
const iaChat = new IAChat();
global.iaChat = iaChat;
