# Pocket Wallet

A local-first personal finance tracker inspired by the simplicity of Apple Wallet.

## Product idea

Your wallet contains cards. Each card represents a place where your money lives — GCash, BPI, cash, savings, or any custom account. Expenses, income, transfers, goals, and debts are tracked around those cards.

## V1 architecture

- Responsive web app / PWA
- Vanilla HTML, CSS, and JavaScript modules
- IndexedDB for local financial data
- Web Crypto for PIN verification
- Service Worker for offline use
- No Supabase and no cloud database
- Vercel for static hosting

Financial records stay in the browser on the device. Vercel serves the app files only.

## Core V1 flows

- Onboarding: name, currency, starting balances, optional 6-digit PIN
- Wallet: create and reorder personal money cards
- Transactions: expenses and income per card
- Transfers: move money between cards without changing total balance
- Activity: unified transaction history
- Goals: savings targets and debt overview
- Insights: monthly income, spending, and net change
- Privacy: hide balances and local app lock
- Offline support through a service worker

## Development

This project intentionally uses no build step for the first version. Open `index.html` with a local static server, or deploy the repository directly to Vercel.

## Data note

Do not commit personal financial exports or backups to this repository.
