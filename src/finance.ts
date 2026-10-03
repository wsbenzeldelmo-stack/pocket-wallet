
import type { Tx, WalletCard, WalletState } from './store'

export function applyTxToCards(cards: WalletCard[], tx: Tx, direction: 1 | -1 = 1): WalletCard[] {
  return cards.map((card) => {
    let delta = 0
    if ((tx.kind === 'expense' || tx.kind === 'debt-payment') && tx.cardId === card.id) delta -= tx.amount * direction
    if ((tx.kind === 'income' || tx.kind === 'repayment') && tx.cardId === card.id) delta += tx.amount * direction
    if (tx.kind === 'transfer') {
      if (tx.fromId === card.id) delta -= tx.amount * direction
      if (tx.toId === card.id) delta += tx.amount * direction
    }
    if (tx.kind === 'adjustment' && tx.cardId === card.id) delta += (tx.delta || 0) * direction
    return delta ? { ...card, balance: card.balance + delta } : card
  })
}

export function deleteTransaction(state: WalletState, txId: string): WalletState {
  const tx = state.txs.find((item) => item.id === txId)
  if (!tx) return state
  const cards = applyTxToCards(state.cards, tx, -1)
  let debts = state.debts
  if ((tx.kind === 'debt-payment' || tx.kind === 'repayment') && tx.debtId) {
    debts = state.debts.map((debt) => debt.id === tx.debtId
      ? {
          ...debt,
          remaining: Math.min(debt.original, debt.remaining + tx.amount),
          payments: debt.payments.filter((payment) => payment.txId !== tx.id),
        }
      : debt)
  }
  return { ...state, cards, debts, txs: state.txs.filter((item) => item.id !== txId) }
}

export function replaceTransaction(state: WalletState, previous: Tx, next: Tx): WalletState {
  const reverted = applyTxToCards(state.cards, previous, -1)
  const cards = applyTxToCards(reverted, next, 1)
  return { ...state, cards, txs: state.txs.map((item) => item.id === previous.id ? next : item) }
}

export function monthBounds(offset = 0): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return { start, end }
}

export function transactionsInMonth(txs: Tx[], offset = 0): Tx[] {
  const { start, end } = monthBounds(offset)
  return txs.filter((tx) => {
    const date = new Date(tx.createdAt)
    return date >= start && date < end
  })
}
