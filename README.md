# Pocket Wallet

A local-first personal finance wallet with a calm Apple Wallet-inspired UI.

## Stack

- React 19 + TypeScript
- Vite
- IndexedDB for local financial data
- Web Crypto PBKDF2 for optional 6-digit PIN protection
- Vite PWA / Workbox for installable offline use
- Lucide icons
- Custom responsive CSS design system
- Vercel for hosting

There is **no backend and no Supabase** in V1. Financial records remain in the browser on the current device.

## Core V1

- Guided onboarding: name, currency, starting balances, optional PIN
- Wallet cards for GCash, banks, cash, savings, and custom money locations
- Expenses and income per card
- Card-to-card transfers that preserve total wallet balance
- Unified activity history
- Savings goals
- I owe and Owed to me records
- Monthly insights and category totals
- Balance privacy toggle
- Offline-installable PWA shell

## UX laws applied

- **Hick's Law:** only three primary quick actions on Wallet.
- **Miller's Law:** four top-level destinations on mobile.
- **Fitts's Law:** large touch targets and thumb-friendly mobile actions.
- **Jakob's Law:** familiar wallet, card, transaction, and transfer metaphors.
- **Progressive disclosure:** secondary actions live in sheets or their relevant page.
- **Error prevention:** card transfers validate distinct cards and available balance; expenses cannot exceed the selected card balance.
- **Aesthetic-usability effect:** consistent 8px-derived spacing, restrained gradients, soft surfaces, and limited visual noise.

## Local development

    npm install
    npm run dev

Production build:

    npm run build

## Privacy

Do not commit financial exports or backup files to this repository.
