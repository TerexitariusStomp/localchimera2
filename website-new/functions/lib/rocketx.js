const DEFAULT_BASE_URL = 'https://api.rocketx.exchange';

const NETWORK_TOKENS = {
  akash: { chain: 'COSMOS', token: 'akash-network', name: 'AKT' },
  golem: { chain: 'ETHEREUM', token: 'golem', name: 'GLM' },
  storj: { chain: 'ETHEREUM', token: 'storj', name: 'STORJ' },
  btt: { chain: 'ETHEREUM', token: 'bittorrent', name: 'BTT' },
};

const CASPER_TOKEN = { chain: 'CSPR', token: 'casper', name: 'CSPR' };

// RocketX quotation API params per target network.
// toToken can be 'null' (native token) or a contract address.
export const ROCKETX_QUOTE_PARAMS = {
  akash:      { toNetwork: 'Akash',    toToken: 'null' },
  golem:      { toNetwork: 'Ethereum', toToken: '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429' },
  storj:      { toNetwork: 'Ethereum', toToken: '0xb64ef51c888972c908cfacf59b47c1afbc0ab8ac' },
  btt:        { toNetwork: 'Ethereum', toToken: '0xc669928185dbce49d2230cc9b0979be6dc797957' },
};

export function buildRocketXUrl(sourceAmount, targetNetwork, apiKey) {
  const dst = NETWORK_TOKENS[targetNetwork];
  if (!dst) return null;
  const amount = sourceAmount || '1';
  let url = `https://app.rocketx.exchange/swap/${CASPER_TOKEN.chain}.${CASPER_TOKEN.token}/${dst.chain}.${dst.token}/${amount}`;
  if (apiKey) url += `?apiKey=${encodeURIComponent(apiKey)}`;
  return url;
}

export class RocketXClient {
  constructor(apiKey, baseURL = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.baseURL = baseURL.replace(/\/$/, '');
  }

  static fromEnv(env) {
    return new RocketXClient(env.ROCKETX_API_KEY, env.ROCKETX_API_URL);
  }

  apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api'] = this.apiKey;
    return h;
  }

  apiKeyHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  async getConfigs() {
    const res = await fetch(`${this.baseURL}/v1/configs`, {
      headers: this.apiHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `RocketX configs failed: ${res.status}`);
    return data;
  }

  async getTokens({ chainId, keyword = 'All', page = 1, perPage = 100 }) {
    const params = new URLSearchParams({ keyword, page: String(page), perPage: String(perPage) });
    if (chainId) params.set('chainId', chainId);
    const res = await fetch(`${this.baseURL}/v1/tokens?${params.toString()}`, {
      headers: this.apiHeaders(),
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data.message || `RocketX tokens failed: ${res.status}`);
    return data;
  }

  async getQuotation({ fromNetwork = 'Casper', fromToken = 'null', toNetwork, toToken = 'null', amount = '1', slippage = '1', excludedExchanges = '' }) {
    const params = new URLSearchParams({
      fromToken: fromToken === null ? 'null' : String(fromToken),
      fromNetwork,
      toToken: toToken === null ? 'null' : String(toToken),
      toNetwork,
      amount: String(amount),
      slippage: String(slippage),
    });
    if (excludedExchanges) params.set('excludedExchanges', excludedExchanges);
    const res = await fetch(`${this.baseURL}/v1/quotation?${params.toString()}`, {
      headers: this.apiKeyHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `RocketX quotation failed: ${res.status}`);
    return data;
  }

  async buildSwap({ fromTokenId, toTokenId, userAddress, destinationAddress, amount, slippage = 1, fee = 0.6, disableEstimate = true, exchangeId, rateId, referrerAddress }) {
    const body = {
      fromTokenId: Number(fromTokenId),
      toTokenId: Number(toTokenId),
      userAddress,
      destinationAddress: destinationAddress || userAddress,
      amount: Number(amount),
      slippage: Number(slippage),
      fee: Number(fee),
      disableEstimate,
    };
    if (exchangeId !== undefined) body.exchangeId = Number(exchangeId);
    if (rateId) body.rateId = rateId;
    if (referrerAddress) body.referrerAddress = referrerAddress;

    const res = await fetch(`${this.baseURL}/v1/swap`, {
      method: 'POST',
      headers: this.apiKeyHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `RocketX swap failed: ${res.status}`);
    return data;
  }

  async getStatus({ requestId, txId }) {
    const params = new URLSearchParams();
    if (requestId) params.set('requestId', requestId);
    if (txId) params.set('txId', txId);
    const res = await fetch(`${this.baseURL}/v1/status?${params.toString()}`, {
      headers: this.apiKeyHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `RocketX status failed: ${res.status}`);
    return data;
  }
}

export default RocketXClient;
