import axios from 'axios';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

// Exchange rates (base: NGN)
const EXCHANGE_RATES = {
  NGN: 1,
  USD: 0.00065,   // 1 NGN = 0.00065 USD (example, update with real API)
  GBP: 0.00051,
  EUR: 0.00060,
  CAD: 0.00088,
  GHS: 0.0095,
  KES: 0.084,
  ZAR: 0.012,
  XOF: 0.39
};

export class CurrencyService {
  private static instance: CurrencyService;
  private redis: RedisService;

  private constructor() {
    this.redis = RedisService.getInstance();
  }

  static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;
    
    const cacheKey = `exchange_rate:${fromCurrency}:${toCurrency}`;
    const cached = await this.redis.get<number>(cacheKey);
    if (cached) return cached;

    try {
      // Try to fetch real exchange rate from API
      const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
      const rate = response.data.rates[toCurrency];
      if (rate) {
        await this.redis.set(cacheKey, rate, 3600); // Cache for 1 hour
        return rate;
      }
    } catch (error) {
      logger.warn('Failed to fetch exchange rate, using fallback:', error);
    }

    // Fallback to static rates
    const fromRate = EXCHANGE_RATES[fromCurrency as keyof typeof EXCHANGE_RATES] || 1;
    const toRate = EXCHANGE_RATES[toCurrency as keyof typeof EXCHANGE_RATES] || 1;
    return toRate / fromRate;
  }

  async convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    return amount * rate;
  }

  formatCurrency(amount: number, currency: string): string {
    const symbols: Record<string, string> = {
      NGN: '₦',
      USD: '$',
      GBP: '£',
      EUR: '€',
      CAD: 'C$',
      GHS: '₵',
      KES: 'KSh',
      ZAR: 'R',
      XOF: 'CFA'
    };
    const symbol = symbols[currency] || currency;
    const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  }

  async getUserPreferredCurrency(userId: string): Promise<string> {
    const user = await User.findById(userId).select('preferredCurrency');
    return user?.preferredCurrency || 'NGN';
  }

  async getUserBalanceInPreferredCurrency(userId: string): Promise<{ balance: number; formatted: string; currency: string }> {
    const user = await User.findById(userId).select('walletBalance preferredCurrency');
    if (!user) return { balance: 0, formatted: '₦0', currency: 'NGN' };
    
    const preferredCurrency = user.preferredCurrency || 'NGN';
    const convertedBalance = await this.convertAmount(user.walletBalance, 'NGN', preferredCurrency);
    
    return {
      balance: convertedBalance,
      formatted: this.formatCurrency(convertedBalance, preferredCurrency),
      currency: preferredCurrency
    };
  }
}
