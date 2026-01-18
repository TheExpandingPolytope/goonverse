/**
 * Wallet system - simulates external wallet balance
 * Persists to localStorage
 */

import { CONFIG } from './config.js';

const WALLET_KEY = 'ballistic_wallet_balance';
// Default: 5 entries worth of stake (scales with entry fee)
const DEFAULT_BALANCE = CONFIG.entryFee * 5;

/**
 * Get current wallet balance (in cents)
 */
export function getWalletBalance() {
    const stored = localStorage.getItem(WALLET_KEY);
    if (stored !== null) {
        return parseInt(stored, 10);
    }
    // Initialize with default balance
    setWalletBalance(DEFAULT_BALANCE);
    return DEFAULT_BALANCE;
}

/**
 * Set wallet balance (in cents)
 */
export function setWalletBalance(cents) {
    localStorage.setItem(WALLET_KEY, cents.toString());
}

/**
 * Deposit from wallet into game (entry)
 * @param {number} amount - Amount in cents to deposit
 * @returns {boolean} - True if successful
 */
export function deposit(amount) {
    const balance = getWalletBalance();
    if (balance >= amount) {
        setWalletBalance(balance - amount);
        return true;
    }
    return false;
}

/**
 * Withdraw from game to wallet (exit)
 * @param {number} amount - Amount in cents to withdraw
 */
export function withdraw(amount) {
    const balance = getWalletBalance();
    setWalletBalance(balance + amount);
}

/**
 * Reset wallet to default (for testing)
 */
export function resetWallet() {
    setWalletBalance(DEFAULT_BALANCE);
}

/**
 * Format cents to display string
 */
export function formatWalletBalance() {
    return '$' + (getWalletBalance() / 100).toFixed(2);
}
