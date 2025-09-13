// brian.js
import axios from 'axios';
import crypto from 'crypto';
import querystring from 'querystring';

class Brian {
    constructor(apiKey = '', secretKey = '', baseUrl = 'https://api.binance.com') {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.baseUrl = baseUrl;
        this.recvWindow = 60000;
    }

    async getKlines(symbol, interval, options = {}) {
        try {
            const params = {
                symbol: symbol.toUpperCase(),
                interval,
                ...options
            };

            const response = await this.publicRequest('/api/v3/klines', params);
            return this.parseKlines(response.data);
        } catch (error) {
            console.error('Erro ao obter klines:', error.response?.data || error.message);
            throw error;
        }
    }

    async getPrice(symbol) {
        try {
            const response = await this.publicRequest('/api/v3/ticker/price', { symbol: symbol.toUpperCase() });
            return {
                symbol: response.data.symbol,
                price: parseFloat(response.data.price)
            };
        } catch (error) {
            console.error('Erro ao obter preço:', error.response?.data || error.message);
            throw error;
        }
    }

    async getAccountInfo() {
        try {
            const response = await this.privateRequest('/api/v3/account', {});
            return {
                balances: response.data.balances.reduce((acc, balance) => {
                    if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
                        acc[balance.asset] = {
                            free: parseFloat(balance.free),
                            locked: parseFloat(balance.locked),
                            total: parseFloat(balance.free) + parseFloat(balance.locked)
                        };
                    }
                    return acc;
                }, {}),
                canTrade: response.data.canTrade,
                canWithdraw: response.data.canWithdraw,
                canDeposit: response.data.canDeposit
            };
        } catch (error) {
            console.error('Erro ao obter informações da conta:', error.response?.data || error.message);
            throw error;
        }
    }

    // Método createOrder
    async createOrder(symbol, side, type, options = {}) {
        try {
            const params = {
                symbol: symbol.toUpperCase(),
                side: side.toUpperCase(),
                type: type.toUpperCase(),
                ...options
            };

            // Remover parâmetros undefined para evitar erros na API
            Object.keys(params).forEach(key => {
                if (params[key] === undefined || params[key] === null) {
                    delete params[key];
                }
            });

            // Validações
            if (type.toUpperCase() === 'MARKET') {
                if (side.toUpperCase() === 'BUY' && !params.quoteOrderQty && !params.quantity) {
                    throw new Error('Para ordens de mercado de COMPRA, quoteOrderQty ou quantity é obrigatório');
                }
                if (side.toUpperCase() === 'SELL' && !params.quantity) {
                    throw new Error('Para ordens de mercado de VENDA, quantity é obrigatório');
                }
            }

            if (type.toUpperCase() === 'LIMIT') {
                if (!params.price) {
                    throw new Error('Price é obrigatório para ordens limitadas');
                }
                if (!params.quantity) {
                    throw new Error('Quantity é obrigatório para ordens limitadas');
                }
            }

            const response = await this.privateRequest('/api/v3/order', params, 'POST');
            return {
                orderId: response.data.orderId,
                symbol: response.data.symbol,
                side: response.data.side,
                type: response.data.type,
                price: parseFloat(response.data.price || 0),
                origQty: parseFloat(response.data.origQty),
                executedQty: parseFloat(response.data.executedQty || 0),
                status: response.data.status,
                timeInForce: response.data.timeInForce,
                fills: response.data.fills ? response.data.fills.map(fill => ({
                    price: parseFloat(fill.price),
                    qty: parseFloat(fill.qty),
                    commission: parseFloat(fill.commission),
                    commissionAsset: fill.commissionAsset
                })) : []
            };
        } catch (error) {
            console.error('Erro ao criar ordem:', error.response?.data || error.message);
            throw error;
        }
    }

    async publicRequest(endpoint, params = {}) {
        try {
            const queryString = querystring.stringify(params);
            const url = `${this.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Brian.js/1.0.0'
                }
            });
            
            return response;
        } catch (error) {
            if (error.response) {
                throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                throw new Error('Network Error: Não foi possível conectar à Binance');
            } else {
                throw error;
            }
        }
    }

    async privateRequest(endpoint, params = {}, method = 'GET') {
        try {
            if (!this.apiKey || !this.secretKey) {
                throw new Error('API Key e Secret Key são necessárias para requisições privadas');
            }

            const timestamp = Date.now();
            const recvWindow = this.recvWindow;

            const queryString = querystring.stringify({
                ...params,
                timestamp,
                recvWindow
            });

            const signature = crypto
                .createHmac('sha256', this.secretKey)
                .update(queryString)
                .digest('hex');

            const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;
            
            const config = {
                method,
                url,
                timeout: 10000,
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'User-Agent': 'Brian.js/1.0.0'
                }
            };

            const response = await axios(config);
            return response;
        } catch (error) {
            if (error.response) {
                throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                throw new Error('Network Error: Não foi possível conectar à Binance');
            } else {
                throw error;
            }
        }
    }

    parseKlines(klines) {
        return klines.map(kline => ({
            openTime: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
            closeTime: kline[6],
            quoteAssetVolume: parseFloat(kline[7]),
            trades: kline[8],
            takerBuyBaseAssetVolume: parseFloat(kline[9]),
            takerBuyQuoteAssetVolume: parseFloat(kline[10])
        }));
    }
}

export default Brian;