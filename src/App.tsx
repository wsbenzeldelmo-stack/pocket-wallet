
import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Archive, ArrowDown, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowRightLeft, ArrowUp,
  ArrowUpRight, Banknote, BarChart3, Building2, CalendarDays, Check, ChevronRight,
  Download, Eye, EyeOff, Goal as GoalIcon, HandCoins, Home, Landmark, LockKeyhole,
  MoreHorizontal, Pencil, PiggyBank, Plus, ReceiptText, Search, Settings2, ShieldCheck,
  Trash2, Upload, WalletCards, X,
} from 'lucide-react'
import {
  CardKind, Debt, Goal, Tx, WalletCard, WalletState,
  checkPin, decryptBackup, encryptBackup, loadWallet, makePin, resetWallet, saveWallet,
} from './store'
import { applyTxToCards, deleteTransaction, replaceTransaction, transactionsInMonth } from './finance'

type Page = 'wallet' | 'activity' | 'plans' | 'insights'
type Sheet = null | 'quick' | 'add-card' | 'edit-card' | 'expense' | 'income' | 'transfer' | 'adjust' |
  'transaction' | 'goal' | 'goal-deposit' | 'debt' | 'debt-detail' | 'settings' | 'manage-cards' |
  'backup-export' | 'backup-import'

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()

const emptyState: WalletState = {
  profile: { name: '', currency: 'PHP', onboarded: false, hideBalances: false, hideOnOpen: false },
  cards: [], txs: [], goals: [], debts: [],
}

const THEME_LABELS: Record<string, string> = {
  gcash: 'GCash Blue', bpi: 'BPI Burgundy', maya: 'Maya Green', gotyme: 'GoTyme Cyan',
  unionbank: 'UnionBank Orange', maribank: 'MariBank Orange', landbank: 'Landbank Green',
  cash: 'Cash Cream', savings: 'Savings Mint', sky: 'Sky', lavender: 'Lavender',
  mint: 'Mint', peach: 'Peach', rose: 'Rose', graphite: 'Graphite',
}

const THEME_KEYS = Object.keys(THEME_LABELS)

function suggestedTheme(name: string, kind: CardKind): string {
  const value = name.trim().toLowerCase()
  if (value.includes('gcash')) return 'gcash'
  if (value.includes('bpi')) return 'bpi'
  if (value.includes('maya')) return 'maya'
  if (value.includes('gotyme') || value.includes('go tyme')) return 'gotyme'
  if (value.includes('unionbank') || value.includes('union bank')) return 'unionbank'
  if (value.includes('maribank') || value.includes('mari bank')) return 'maribank'
  if (value.includes('landbank') || value.includes('land bank')) return 'landbank'
  if (kind === 'Cash') return 'cash'
  if (kind === 'Savings') return 'savings'
  return kind === 'Bank' ? 'graphite' : kind === 'E-Wallet' ? 'sky' : 'lavender'
}

function moneyFormatter(currency: string) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 2 })
}

function greeting(name: string) {
  const hour = new Date().getHours()
  const base = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name.trim() ? `${base}, ${name.trim()}.` : `${base}.`
}

function cardIcon(kind: CardKind) {
  if (kind === 'Bank') return <Landmark />
  if (kind === 'Cash') return <Banknote />
  if (kind === 'Savings') return <PiggyBank />
  if (kind === 'E-Wallet') return <WalletCards />
  return <Building2 />
}

export default function App() {
  const [state, setState] = useState<WalletState | null>(null)
  const [page, setPage] = useState<Page>('wallet')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [locked, setLocked] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [selectedTxId, setSelectedTxId] = useState<string>('')
  const [selectedGoalId, setSelectedGoalId] = useState<string>('')
  const [selectedDebtId, setSelectedDebtId] = useState<string>('')
  const [actionCardId, setActionCardId] = useState<string>('')

  useEffect(() => {
    loadWallet().then((saved) => {
      const next = saved || emptyState
      if (next.profile.hideOnOpen) next.profile.hideBalances = true
      setState(next)
      const first = [...next.cards].filter((card) => !card.archived).sort((a, b) => a.order - b.order)[0]
      setSelectedCardId(first?.id || '')
      setLocked(Boolean(next.profile.onboarded && next.profile.pin))
    })
  }, [])

  useEffect(() => {
    if (state) saveWallet(state).catch(console.error)
  }, [state])

  if (!state) return <div className="splash"><AppIcon/><strong>Pocket Wallet</strong></div>
  if (!state.profile.onboarded) return <Onboarding onDone={(next) => {
    setState(next)
    setSelectedCardId(next.cards[0]?.id || '')
    setLocked(false)
  }}/>
  if (locked && state.profile.pin) {
    return <LockScreen name={state.profile.name} onUnlock={async (pin) => {
      const ok = await checkPin(pin, state.profile.pin!)
      if (ok) setLocked(false)
      return ok
    }}/>
  }

  const formatter = moneyFormatter(state.profile.currency)
  const money = (value: number) => state.profile.hideBalances ? '••••••' : formatter.format(value)
  const cards = [...state.cards].filter((card) => !card.archived).sort((a, b) => a.order - b.order)
  const selectedCard = cards.find((card) => card.id === selectedCardId) || cards[0]
  const total = cards.reduce((sum, card) => sum + card.balance, 0)

  const mutate = (fn: (current: WalletState) => WalletState) => setState((current) => current ? fn(current) : current)
  const openAction = (kind: Sheet, cardId?: string) => { setActionCardId(cardId || selectedCard?.id || ''); setSheet(kind) }

  const addCard = (draft: Omit<WalletCard, 'id' | 'order'>) => {
    const newCard: WalletCard = { ...draft, id: id(), order: state.cards.length }
    mutate((current) => ({ ...current, cards: [...current.cards, newCard] }))
    setSelectedCardId(newCard.id)
    setSheet(null)
  }

  const editCard = (cardId: string, patch: Partial<WalletCard>) => {
    mutate((current) => ({ ...current, cards: current.cards.map((card) => card.id === cardId ? { ...card, ...patch } : card) }))
    setSheet(null)
  }

  const archiveOrDeleteCard = (cardId: string) => {
    const hasHistory = state.txs.some((tx) => tx.cardId === cardId || tx.fromId === cardId || tx.toId === cardId)
    const target = state.cards.find((card) => card.id === cardId)
    if (!target) return
    if (hasHistory) {
      if (!window.confirm(`${target.name} has transaction history, so it will be archived instead of deleted. Continue?`)) return
      mutate((current) => ({ ...current, cards: current.cards.map((card) => card.id === cardId ? { ...card, archived: true } : card) }))
    } else {
      if (!window.confirm(`Delete ${target.name}? This cannot be undone.`)) return
      mutate((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== cardId) }))
    }
    const next = cards.find((card) => card.id !== cardId)
    setSelectedCardId(next?.id || '')
    setSheet(null)
  }

  const reorderCard = (cardId: string, direction: -1 | 1) => {
    mutate((current) => {
      const ordered = [...current.cards].sort((a, b) => a.order - b.order)
      const index = ordered.findIndex((card) => card.id === cardId)
      const swap = index + direction
      if (index < 0 || swap < 0 || swap >= ordered.length) return current
      const first = ordered[index]
      const second = ordered[swap]
      return { ...current, cards: current.cards.map((card) => card.id === first.id ? { ...card, order: second.order } : card.id === second.id ? { ...card, order: first.order } : card) }
    })
  }

  const createTransaction = (tx: Tx) => {
    mutate((current) => ({ ...current, cards: applyTxToCards(current.cards, tx), txs: [tx, ...current.txs] }))
    setSheet(null)
  }

  const addExpenseIncome = (kind: 'expense' | 'income', cardId: string, amount: number, category: string, note: string) => {
    createTransaction({ id: id(), kind, cardId, amount, category, title: note.trim() || category, note: note.trim(), createdAt: now() })
  }

  const moveMoney = (fromId: string, toId: string, amount: number) => {
    createTransaction({ id: id(), kind: 'transfer', fromId, toId, amount, title: 'Transfer', createdAt: now() })
  }

  const adjustBalance = (cardId: string, target: number, note: string) => {
    const card = state.cards.find((item) => item.id === cardId)
    if (!card) return
    const delta = target - card.balance
    if (delta === 0) { setSheet(null); return }
    createTransaction({ id: id(), kind: 'adjustment', cardId, amount: Math.abs(delta), delta, title: note.trim() || 'Balance adjustment', note: note.trim(), createdAt: now() })
  }

  const updateTransaction = (previous: Tx, next: Tx) => {
    mutate((current) => replaceTransaction(current, previous, next))
    setSheet(null)
  }

  const removeTransaction = (txId: string) => {
    if (!window.confirm('Delete this transaction? The affected balance will be recalculated.')) return
    mutate((current) => deleteTransaction(current, txId))
    setSheet(null)
  }

  const addGoal = (draft: Omit<Goal, 'id' | 'current'>) => {
    mutate((current) => ({ ...current, goals: [...current.goals, { ...draft, id: id(), current: 0 }] }))
    setSheet(null)
  }

  const depositGoal = (goalId: string, fromId: string, amount: number) => {
    const goal = state.goals.find((item) => item.id === goalId)
    if (!goal?.linkedCardId) return
    const tx: Tx = { id: id(), kind: 'transfer', amount, fromId, toId: goal.linkedCardId, goalId, title: `Saved for ${goal.name}`, createdAt: now() }
    mutate((current) => ({
      ...current,
      cards: applyTxToCards(current.cards, tx),
      txs: [tx, ...current.txs],
      goals: current.goals.map((item) => item.id === goalId ? { ...item, current: Math.min(item.target, item.current + amount) } : item),
    }))
    setSheet(null)
  }

  const addDebt = (draft: Omit<Debt, 'id' | 'remaining' | 'payments'>) => {
    mutate((current) => ({ ...current, debts: [{ ...draft, id: id(), remaining: draft.original, payments: [] }, ...current.debts] }))
    setSheet(null)
  }

  const recordDebtPayment = (debtId: string, cardId: string, amount: number) => {
    const debt = state.debts.find((item) => item.id === debtId)
    if (!debt) return
    const txId = id()
    const tx: Tx = {
      id: txId,
      kind: debt.direction === 'owe' ? 'debt-payment' : 'repayment',
      amount, cardId, debtId,
      title: debt.direction === 'owe' ? `Paid ${debt.person}` : `Received from ${debt.person}`,
      category: debt.direction === 'owe' ? 'Debt payment' : 'Repayment',
      createdAt: now(),
    }
    mutate((current) => ({
      ...current,
      cards: applyTxToCards(current.cards, tx),
      txs: [tx, ...current.txs],
      debts: current.debts.map((item) => item.id === debtId ? {
        ...item,
        remaining: Math.max(0, item.remaining - amount),
        payments: [{ id: id(), txId, amount, cardId, createdAt: tx.createdAt }, ...item.payments],
      } : item),
    }))
    setSheet(null)
  }

  const selectedTx = state.txs.find((tx) => tx.id === selectedTxId)
  const selectedGoal = state.goals.find((goal) => goal.id === selectedGoalId)
  const selectedDebt = state.debts.find((debt) => debt.id === selectedDebtId)
  const editingCard = state.cards.find((card) => card.id === selectedCardId)

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <nav>
        <Nav icon={<Home/>} label="Wallet" active={page === 'wallet'} onClick={() => setPage('wallet')}/>
        <Nav icon={<ReceiptText/>} label="Activity" active={page === 'activity'} onClick={() => setPage('activity')}/>
        <Nav icon={<GoalIcon/>} label="Plans" active={page === 'plans'} onClick={() => setPage('plans')}/>
        <Nav icon={<BarChart3/>} label="Insights" active={page === 'insights'} onClick={() => setPage('insights')}/>
      </nav>
      <button className="sidebar-settings" onClick={() => setSheet('settings')}><Settings2/> Settings</button>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><span className="eyebrow">Pocket Wallet</span><h1>{greeting(state.profile.name)}</h1><p>See where your money lives, then act on the card that matters.</p></div>
        <button className="icon-btn" aria-label={state.profile.hideBalances ? 'Show balances' : 'Hide balances'} onClick={() => mutate((current) => ({ ...current, profile: { ...current.profile, hideBalances: !current.profile.hideBalances } }))}>{state.profile.hideBalances ? <EyeOff/> : <Eye/>}</button>
      </header>

      {page === 'wallet' && <WalletPage
        cards={cards} selectedCard={selectedCard} total={total} state={state} money={money}
        onSelect={setSelectedCardId} onAction={openAction} onAddCard={() => setSheet('add-card')}
        onActivity={() => setPage('activity')} onManage={() => setSheet('edit-card')}
        onTx={(txId) => { setSelectedTxId(txId); setSheet('transaction') }}
      />}
      {page === 'activity' && <ActivityPage state={state} money={money} onTx={(txId) => { setSelectedTxId(txId); setSheet('transaction') }}/>}
      {page === 'plans' && <PlansPage state={state} money={money}
        onGoal={() => setSheet('goal')} onGoalOpen={(goalId) => { setSelectedGoalId(goalId); setSheet('goal-deposit') }}
        onDebt={() => setSheet('debt')} onDebtOpen={(debtId) => { setSelectedDebtId(debtId); setSheet('debt-detail') }}/>}
      {page === 'insights' && <InsightsPage state={state} money={money}/>}
    </main>

    <nav className="bottom-nav">
      <Nav icon={<Home/>} label="Wallet" active={page === 'wallet'} onClick={() => setPage('wallet')} mobile/>
      <Nav icon={<ReceiptText/>} label="Activity" active={page === 'activity'} onClick={() => setPage('activity')} mobile/>
      <Nav icon={<GoalIcon/>} label="Plans" active={page === 'plans'} onClick={() => setPage('plans')} mobile/>
      <Nav icon={<BarChart3/>} label="Insights" active={page === 'insights'} onClick={() => setPage('insights')} mobile/>
    </nav>

    <button className="fab" aria-label="Quick add" onClick={() => setSheet('quick')}><Plus/></button>

    {sheet && <Sheet onClose={() => setSheet(null)}>
      {sheet === 'quick' && <QuickAdd onPick={(value) => setSheet(value)}/>}
      {sheet === 'add-card' && <CardForm currency={state.profile.currency} onSubmit={addCard}/>}
      {sheet === 'edit-card' && editingCard && <EditCardForm card={editingCard} onSave={(patch) => editCard(editingCard.id, patch)} onAdjust={() => setSheet('adjust')} onArchive={() => archiveOrDeleteCard(editingCard.id)}/>}
      {sheet === 'adjust' && editingCard && <AdjustmentForm card={editingCard} money={money} onSubmit={(target, note) => adjustBalance(editingCard.id, target, note)}/>}
      {sheet === 'expense' && <TransactionForm mode="expense" currency={state.profile.currency} cards={cards} defaultCardId={actionCardId} onSubmit={addExpenseIncome}/>}
      {sheet === 'income' && <TransactionForm mode="income" currency={state.profile.currency} cards={cards} defaultCardId={actionCardId} onSubmit={addExpenseIncome}/>}
      {sheet === 'transfer' && <TransferForm currency={state.profile.currency} cards={cards} defaultFromId={actionCardId} onSubmit={moveMoney}/>}
      {sheet === 'transaction' && selectedTx && <TransactionDetail tx={selectedTx} state={state} money={money} onUpdate={updateTransaction} onDelete={() => removeTransaction(selectedTx.id)}/>}
      {sheet === 'goal' && <GoalForm cards={cards} onSubmit={addGoal}/>}
      {sheet === 'goal-deposit' && selectedGoal && <GoalDepositForm currency={state.profile.currency} goal={selectedGoal} cards={cards} money={money} onSubmit={(fromId, amount) => depositGoal(selectedGoal.id, fromId, amount)}/>}
      {sheet === 'debt' && <DebtForm onSubmit={addDebt}/>}
      {sheet === 'debt-detail' && selectedDebt && <DebtDetail currency={state.profile.currency} debt={selectedDebt} cards={cards} money={money} onPay={(cardId, amount) => recordDebtPayment(selectedDebt.id, cardId, amount)}/>}
      {sheet === 'settings' && <Settings state={state} onLock={() => { setSheet(null); if (state.profile.pin) setLocked(true) }} onManage={() => setSheet('manage-cards')} onExport={() => setSheet('backup-export')} onImport={() => setSheet('backup-import')} onReset={async () => { await resetWallet(); setState(emptyState); setSheet(null) }}/>}
      {sheet === 'manage-cards' && <ManageCards cards={[...state.cards].sort((a,b) => a.order-b.order)} money={money} onMove={reorderCard} onEdit={(cardId) => { setSelectedCardId(cardId); setSheet('edit-card') }}/>}
      {sheet === 'backup-export' && <BackupExport state={state}/>}
      {sheet === 'backup-import' && <BackupImport onImport={(next) => { setState(next); setSelectedCardId(next.cards.find((card) => !card.archived)?.id || ''); setSheet(null) }}/>}
    </Sheet>}
  </div>
}

function AppIcon() { return <div className="app-icon"><WalletCards/></div> }
function Brand() { return <div className="brand"><AppIcon/><strong>Pocket Wallet</strong></div> }

function Nav({ icon, label, active, onClick, mobile = false }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; mobile?: boolean }) {
  return <button className={`${mobile ? 'mobile-nav' : 'nav'}${active ? ' active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

interface SetupAccount { key: string; name: string; kind: CardKind; selected: boolean; balance: number; theme: string }

function Onboarding({ onDone }: { onDone: (state: WalletState) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('PHP')
  const [accounts, setAccounts] = useState<SetupAccount[]>([
    { key: 'gcash', name: 'GCash', kind: 'E-Wallet', selected: true, balance: 5000, theme: 'gcash' },
    { key: 'maya', name: 'Maya', kind: 'E-Wallet', selected: false, balance: 0, theme: 'maya' },
    { key: 'bpi', name: 'BPI', kind: 'Bank', selected: true, balance: 10000, theme: 'bpi' },
    { key: 'cash', name: 'Cash', kind: 'Cash', selected: true, balance: 2000, theme: 'cash' },
    { key: 'savings', name: 'Savings', kind: 'Savings', selected: false, balance: 0, theme: 'savings' },
  ])
  const [customName, setCustomName] = useState('')
  const [customKind, setCustomKind] = useState<CardKind>('Bank')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [hideOnOpen, setHideOnOpen] = useState(false)
  const [error, setError] = useState('')
  const formatter = moneyFormatter(currency)
  const selectedAccounts = accounts.filter((account) => account.selected)
  const total = selectedAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)

  const addCustom = () => {
    const clean = customName.trim()
    if (!clean) return
    setAccounts((current) => [...current, { key: id(), name: clean, kind: customKind, selected: true, balance: 0, theme: suggestedTheme(clean, customKind) }])
    setCustomName('')
  }

  const finish = async () => {
    setError('')
    if (!selectedAccounts.length) { setError('Add at least one card to your wallet.'); return }
    if (pin && (!/^\d{6}$/.test(pin) || pin !== confirmPin)) { setError('Use the same 6-digit PIN in both fields.'); return }
    const pinRecord = pin ? await makePin(pin) : undefined
    const cards = selectedAccounts.map((account, order): WalletCard => ({ id: id(), name: account.name, kind: account.kind, balance: Number(account.balance || 0), theme: account.theme, order }))
    onDone({
      profile: { name: name.trim(), currency, onboarded: true, hideBalances: hideOnOpen, hideOnOpen, pin: pinRecord },
      cards, txs: [], goals: [], debts: [],
    })
  }

  return <div className="onboard-shell"><section className="onboard-layout">
    <div className="onboard-preview" aria-hidden="true">
      <div className="preview-brand"><AppIcon/><span>Pocket Wallet</span></div>
      <div className="preview-copy"><span className="eyebrow">Your wallet, taking shape</span><h2>{step === 0 ? 'A calm home for your money.' : step === 1 ? `${formatter.format(total)} across ${selectedAccounts.length} card${selectedAccounts.length === 1 ? '' : 's'}.` : 'Private by default. Yours to control.'}</h2></div>
      <div className="preview-stack">{(selectedAccounts.length ? selectedAccounts : [{ key: 'sample', name: 'Your first card', kind: 'Custom' as CardKind, selected: true, balance: 0, theme: 'lavender' }]).slice(0,4).map((account) => <CardVisual key={account.key} card={{ id: account.key, name: account.name, kind: account.kind, balance: account.balance, theme: account.theme, order: 0 }} money={(value) => formatter.format(value)} preview/>)}</div>
    </div>

    <div className="onboard-panel">
      <div className="onboard-progress"><span>{step + 1} of 3</span><div><i style={{ width: `${((step + 1) / 3) * 100}%` }}/></div></div>
      {step === 0 && <div className="onboard-step"><span className="eyebrow">Welcome</span><h1>Your money, in one place.</h1><p>Start with the basics. You can change these later.</p><Field label="Your name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex"/></Field><div className="setting-row"><span><small>Currency</small><b>{currency === 'PHP' ? 'Philippine Peso (₱)' : currency === 'USD' ? 'US Dollar ($)' : 'Euro (€)'}</b></span><select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="PHP">PHP</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div></div>}
      {step === 1 && <div className="onboard-step"><span className="eyebrow">Build your wallet</span><h1>Where is your money?</h1><p>Add only the places you actually use. Your total updates as you type.</p><div className="account-picker">{accounts.map((account) => <div className={`setup-account${account.selected ? ' selected' : ''}`} key={account.key}><button className="setup-toggle" type="button" onClick={() => setAccounts((current) => current.map((item) => item.key === account.key ? { ...item, selected: !item.selected } : item))}><span className={`account-icon theme-${account.theme}`}>{cardIcon(account.kind)}</span><span><b>{account.name}</b><small>{account.kind}</small></span><span className="check-circle">{account.selected && <Check/>}</span></button>{account.selected && <div className="setup-balance"><span>{currency === 'PHP' ? '₱' : currency === 'USD' ? '$' : '€'}</span><input aria-label={`${account.name} starting balance`} type="number" min="0" step="0.01" value={account.balance} onChange={(event) => setAccounts((current) => current.map((item) => item.key === account.key ? { ...item, balance: Number(event.target.value) } : item))}/></div>}</div>)}</div><div className="custom-account"><input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Add another account"/><select value={customKind} onChange={(event) => setCustomKind(event.target.value as CardKind)}><option>Bank</option><option>E-Wallet</option><option>Cash</option><option>Savings</option><option>Custom</option></select><button type="button" onClick={addCustom}><Plus/></button></div><div className="starting-total"><span>Total starting money</span><b>{formatter.format(total)}</b></div></div>}
      {step === 2 && <div className="onboard-step"><span className="eyebrow">Privacy</span><h1>Protect your wallet.</h1><p>Your data stays on this device. Add an optional PIN and choose how balances appear when Pocket Wallet opens.</p><Field label="6-digit PIN (optional)"><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0,6))} placeholder="••••••"/></Field><Field label="Confirm PIN"><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0,6))} placeholder="••••••"/></Field><label className="toggle-row"><span><b>Hide balances on open</b><small>Tap the eye icon when you want to reveal them.</small></span><input type="checkbox" checked={hideOnOpen} onChange={(event) => setHideOnOpen(event.target.checked)}/></label><div className="finish-summary"><div><small>Total</small><b>{formatter.format(total)}</b></div><div><small>Cards</small><b>{selectedAccounts.length}</b></div><div><small>Protection</small><b>{pin ? 'PIN' : 'Device only'}</b></div></div>{error && <div className="error">{error}</div>}</div>}
      <div className="onboard-actions">{step > 0 && <button className="btn ghost" onClick={() => { setError(''); setStep(step - 1) }}><ArrowLeft/> Back</button>}<button className="btn primary" onClick={() => step < 2 ? setStep(step + 1) : finish()}>{step < 2 ? <>Continue <ArrowRight/></> : <>Open My Wallet <ArrowRight/></>}</button></div>
    </div>
  </section></div>
}

function LockScreen({ name, onUnlock }: { name: string; onUnlock: (pin: string) => Promise<boolean> }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  return <div className="onboard-shell"><form className="lock-card" onSubmit={async (event) => { event.preventDefault(); const ok = await onUnlock(pin); if (!ok) { setBad(true); setPin('') } }}><div className="lock-icon"><LockKeyhole/></div><span className="eyebrow">Pocket Wallet</span><h1>{name ? `Welcome back, ${name}.` : 'Welcome back.'}</h1><p>Enter your PIN to reveal your wallet.</p><input className="pin" autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => { setBad(false); setPin(event.target.value.replace(/\D/g, '').slice(0,6)) }} placeholder="••••••"/>{bad && <div className="error">That PIN doesn't match.</div>}<button className="btn primary full" disabled={pin.length !== 6}>Unlock</button></form></div>
}

function WalletPage({ cards, selectedCard, total, state, money, onSelect, onAction, onAddCard, onActivity, onManage, onTx }: {
  cards: WalletCard[]; selectedCard?: WalletCard; total: number; state: WalletState; money: (value: number) => string;
  onSelect: (id: string) => void; onAction: (kind: Sheet, cardId?: string) => void; onAddCard: () => void; onActivity: () => void; onManage: () => void; onTx: (txId: string) => void
}) {
  const thisMonth = transactionsInMonth(state.txs)
  const selectedTxs = selectedCard ? state.txs.filter((tx) => tx.cardId === selectedCard.id || tx.fromId === selectedCard.id || tx.toId === selectedCard.id).slice(0,6) : []
  const selectedSpent = selectedCard ? thisMonth.filter((tx) => tx.kind === 'expense' && tx.cardId === selectedCard.id).reduce((sum, tx) => sum + tx.amount, 0) : 0
  return <>
    <section className="balance-summary"><div><span className="eyebrow">Total available</span><strong>{money(total)}</strong><small>Across {cards.length} active card{cards.length === 1 ? '' : 's'}</small></div><div className="summary-note"><ShieldCheck/><span><b>Local-first</b><small>Your financial data stays on this device.</small></span></div></section>
    <section className="section wallet-section"><div className="section-head"><div><span className="eyebrow">Wallet</span><h2>Your cards</h2></div><button className="text-btn" onClick={onAddCard}><Plus/> Add card</button></div>{cards.length ? <div className="wallet-cards">{cards.map((card) => <CardVisual key={card.id} card={card} money={money} selected={card.id === selectedCard?.id} onClick={() => onSelect(card.id)}/>)}</div> : <Empty text="Add your first card to start tracking money."/>}</section>
    {selectedCard && <section className="selected-card-panel"><div className="selected-card-head"><div><span className="eyebrow">Selected card</span><h2>{selectedCard.name}</h2><p>{money(selectedCard.balance)} available · {selectedCard.kind}</p></div><button className="icon-btn" aria-label="Manage card" onClick={onManage}><MoreHorizontal/></button></div><div className="card-actions"><Quick icon={<ArrowUpRight/>} label="Expense" onClick={() => onAction('expense', selectedCard.id)}/><Quick icon={<ArrowDownLeft/>} label="Income" onClick={() => onAction('income', selectedCard.id)}/><Quick icon={<ArrowRightLeft/>} label="Move money" onClick={() => onAction('transfer', selectedCard.id)}/></div><div className="selected-card-meta"><div><small>Spent this month</small><b>{money(selectedSpent)}</b></div><div><small>Transactions</small><b>{selectedTxs.length}</b></div></div></section>}
    <section className="section"><div className="section-head"><div><span className="eyebrow">Latest</span><h2>{selectedCard ? `${selectedCard.name} activity` : 'Recent activity'}</h2></div><button className="text-btn" onClick={onActivity}>See all <ChevronRight/></button></div><TxList txs={selectedTxs.length ? selectedTxs : state.txs.slice(0,6)} state={state} money={money} onOpen={onTx}/></section>
  </>
}

function CardVisual({ card, money, selected = false, onClick, preview = false }: { card: WalletCard; money: (value: number) => string; selected?: boolean; onClick?: () => void; preview?: boolean }) {
  const content = <><div className="card-top"><span className="card-identity"><i>{cardIcon(card.kind)}</i><span><b>{card.name}</b><small>{card.kind}</small></span></span><span className="card-kind">{card.kind}</span></div><div className="card-balance"><small>Available balance</small><strong>{money(card.balance)}</strong></div><div className="card-foot"><span>{card.last4 ? `•••• ${card.last4}` : THEME_LABELS[card.theme] || 'Pocket card'}</span><span>Pocket</span></div></>
  if (onClick) return <button className={`wallet-card theme-${card.theme}${selected ? ' selected' : ''}`} onClick={onClick}>{content}</button>
  return <div className={`wallet-card theme-${card.theme}${preview ? ' preview-card' : ''}`}>{content}</div>
}

function ActivityPage({ state, money, onTx }: { state: WalletState; money: (value: number) => string; onTx: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'transfer' | 'debt'>('all')
  const [query, setQuery] = useState('')
  const list = state.txs.filter((tx) => {
    const filterOk = filter === 'all' || (filter === 'debt' ? tx.kind === 'debt-payment' || tx.kind === 'repayment' : tx.kind === filter)
    const card = state.cards.find((item) => item.id === tx.cardId || item.id === tx.fromId || item.id === tx.toId)
    const haystack = `${tx.title} ${tx.category || ''} ${tx.note || ''} ${card?.name || ''} ${tx.amount}`.toLowerCase()
    return filterOk && haystack.includes(query.trim().toLowerCase())
  })
  return <section className="page"><span className="eyebrow">History</span><h2>Activity</h2><p>Search and review every money movement in one timeline.</p><div className="search-box"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions, cards, notes, amounts…"/></div><div className="segments">{(['all','expense','income','transfer','debt'] as const).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><TxList txs={list} state={state} money={money} onOpen={onTx}/></section>
}

function PlansPage({ state, money, onGoal, onGoalOpen, onDebt, onDebtOpen }: { state: WalletState; money: (value: number) => string; onGoal: () => void; onGoalOpen: (id: string) => void; onDebt: () => void; onDebtOpen: (id: string) => void }) {
  const owe = state.debts.filter((debt) => debt.direction === 'owe' && debt.remaining > 0)
  const owed = state.debts.filter((debt) => debt.direction === 'owedToMe' && debt.remaining > 0)
  return <section className="page"><span className="eyebrow">Savings & people</span><h2>Plans</h2><p>Goals use real wallet money. Debts stay connected to the card you pay from or receive into.</p><div className="section-head sub"><h3>Savings goals</h3><button className="text-btn" onClick={onGoal}><Plus/> New goal</button></div><div className="goal-grid">{state.goals.length ? state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} state={state} money={money} onClick={() => onGoalOpen(goal.id)}/>) : <Empty text="Create a goal and link it to a savings card."/>}</div><div className="section-head sub"><h3>People & debts</h3><button className="text-btn" onClick={onDebt}><Plus/> Add record</button></div><div className="debt-grid"><DebtCard title="I owe" items={owe} money={money} onOpen={onDebtOpen}/><DebtCard title="Owed to me" items={owed} money={money} onOpen={onDebtOpen}/></div></section>
}

function InsightsPage({ state, money }: { state: WalletState; money: (value: number) => string }) {
  const month = transactionsInMonth(state.txs, 0)
  const previous = transactionsInMonth(state.txs, -1)
  const calc = (list: Tx[]) => ({
    income: list.filter((tx) => tx.kind === 'income' || tx.kind === 'repayment').reduce((sum, tx) => sum + tx.amount, 0),
    spent: list.filter((tx) => tx.kind === 'expense' || tx.kind === 'debt-payment').reduce((sum, tx) => sum + tx.amount, 0),
    saved: list.filter((tx) => tx.kind === 'transfer' && state.cards.find((card) => card.id === tx.toId)?.kind === 'Savings').reduce((sum, tx) => sum + tx.amount, 0),
  })
  const current = calc(month)
  const prior = calc(previous)
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    month.filter((tx) => tx.kind === 'expense').forEach((tx) => map.set(tx.category || 'Other', (map.get(tx.category || 'Other') || 0) + tx.amount))
    return [...map.entries()].sort((a,b) => b[1] - a[1]).slice(0,6)
  }, [state.txs])
  const max = Math.max(...categories.map(([, value]) => value), 1)
  const change = prior.spent ? ((current.spent - prior.spent) / prior.spent) * 100 : 0
  return <section className="page"><span className="eyebrow">This month</span><h2>Insights</h2><p>Answers first, charts second.</p><div className="insight-answer"><span>You spent</span><b>{money(current.spent)}</b><small>{prior.spent ? `${Math.abs(change).toFixed(0)}% ${change > 0 ? 'more' : 'less'} than last month` : 'No previous-month comparison yet'}</small></div><div className="metric-grid"><Metric label="Income" value={money(current.income)}/><Metric label="Saved" value={money(current.saved)}/><Metric label="Net change" value={money(current.income - current.spent)}/></div><div className="panel"><h3>Top spending categories</h3>{categories.length ? categories.map(([name, value]) => <div className="bar-row" key={name}><div><span>{name}</span><b>{money(value)}</b></div><div className="bar"><i style={{ width: `${(value / max) * 100}%` }}/></div></div>) : <Empty text="Add expenses to see category insights."/>}</div></section>
}

function TxList({ txs, state, money, onOpen }: { txs: Tx[]; state: WalletState; money: (value: number) => string; onOpen?: (id: string) => void }) {
  const cardName = (cardId?: string) => state.cards.find((card) => card.id === cardId)?.name || 'Card'
  if (!txs.length) return <Empty text="Your transactions will appear here."/>
  return <div className="tx-list">{txs.map((tx) => {
    const meta = tx.kind === 'transfer' ? `${cardName(tx.fromId)} → ${cardName(tx.toId)}` : `${tx.category || tx.kind} · ${cardName(tx.cardId)}`
    const signed = tx.kind === 'expense' || tx.kind === 'debt-payment' ? `−${money(tx.amount)}` : tx.kind === 'income' || tx.kind === 'repayment' ? `+${money(tx.amount)}` : tx.kind === 'adjustment' ? `${(tx.delta || 0) >= 0 ? '+' : '−'}${money(Math.abs(tx.delta || 0))}` : money(tx.amount)
    return <button className="tx-row" key={tx.id} onClick={() => onOpen?.(tx.id)}><div className={`tx-icon ${tx.kind}`}>{tx.kind === 'expense' || tx.kind === 'debt-payment' ? <ArrowUpRight/> : tx.kind === 'income' || tx.kind === 'repayment' ? <ArrowDownLeft/> : <ArrowRightLeft/>}</div><div><b>{tx.title}</b><small>{meta}</small></div><strong className={tx.kind}>{signed}</strong></button>
  })}</div>
}

function Quick({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) { return <button onClick={onClick}>{icon}<b>{label}</b></button> }
function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) { return <div className="backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section className="sheet"><button className="close" aria-label="Close" onClick={onClose}><X/></button>{children}</section></div> }

function QuickAdd({ onPick }: { onPick: (sheet: Sheet) => void }) {
  return <><span className="eyebrow">Quick add</span><h2>What happened?</h2><p>Start with the three actions you'll use most.</p><div className="menu"><button onClick={() => onPick('expense')}><ArrowUpRight/><span><b>Expense</b><small>Money left a card</small></span><ChevronRight/></button><button onClick={() => onPick('income')}><ArrowDownLeft/><span><b>Income</b><small>Money entered a card</small></span><ChevronRight/></button><button onClick={() => onPick('transfer')}><ArrowRightLeft/><span><b>Move money</b><small>Card to card, not an expense</small></span><ChevronRight/></button></div><div className="secondary-actions"><button onClick={() => onPick('goal')}><GoalIcon/> Savings goal</button><button onClick={() => onPick('debt')}><HandCoins/> Debt / owed to me</button></div></>
}

function CardForm({ currency, onSubmit }: { currency: string; onSubmit: (draft: Omit<WalletCard, 'id' | 'order'>) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CardKind>('E-Wallet')
  const [balance, setBalance] = useState(0)
  const [theme, setTheme] = useState('sky')
  const [last4, setLast4] = useState('')
  const suggested = suggestedTheme(name, kind)
  useEffect(() => { if (name.trim()) setTheme(suggested) }, [name, kind])
  const preview: WalletCard = { id: 'preview', name: name.trim() || 'New Card', kind, balance, theme, order: 0, last4 }
  const formatter = moneyFormatter(currency)
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ name: name.trim() || 'New Card', kind, balance, theme, last4: last4.slice(-4), archived: false }) }}><span className="eyebrow">Wallet</span><h2>Create a card</h2><p>One Pocket Wallet layout, with a personality that fits the account.</p><CardVisual card={preview} money={(value) => formatter.format(value)} preview/><Field label="Card name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="GCash"/></Field><div className="field-grid"><Field label="Type"><select value={kind} onChange={(event) => setKind(event.target.value as CardKind)}><option>E-Wallet</option><option>Bank</option><option>Cash</option><option>Savings</option><option>Custom</option></select></Field><Field label="Starting balance"><input type="number" min="0" step="0.01" value={balance} onChange={(event) => setBalance(Number(event.target.value))}/></Field></div><Field label="Last 4 digits (optional)"><input inputMode="numeric" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g,'').slice(0,4))} placeholder="6391"/></Field><ThemePicker theme={theme} onChange={setTheme}/><button className="btn primary full">Create card</button></form>
}

function EditCardForm({ card, onSave, onAdjust, onArchive }: { card: WalletCard; onSave: (patch: Partial<WalletCard>) => void; onAdjust: () => void; onArchive: () => void }) {
  const [name, setName] = useState(card.name)
  const [kind, setKind] = useState<CardKind>(card.kind)
  const [theme, setTheme] = useState(card.theme)
  const [last4, setLast4] = useState(card.last4 || '')
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim() || card.name, kind, theme, last4: last4.slice(-4) }) }}><span className="eyebrow">Card settings</span><h2>{card.name}</h2><Field label="Card name"><input value={name} onChange={(event) => setName(event.target.value)}/></Field><Field label="Type"><select value={kind} onChange={(event) => setKind(event.target.value as CardKind)}><option>E-Wallet</option><option>Bank</option><option>Cash</option><option>Savings</option><option>Custom</option></select></Field><Field label="Last 4 digits"><input inputMode="numeric" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g,'').slice(0,4))}/></Field><ThemePicker theme={theme} onChange={setTheme}/><button className="btn primary full">Save changes</button><button className="btn secondary full" type="button" onClick={onAdjust}>Adjust balance</button><button className="danger full-action" type="button" onClick={onArchive}><Archive/> Archive / delete card</button></form>
}

function ThemePicker({ theme, onChange }: { theme: string; onChange: (theme: string) => void }) {
  return <div className="theme-picker"><span className="field-label">Appearance</span><div>{THEME_KEYS.map((key) => <button type="button" key={key} className={`theme-option theme-${key}${theme === key ? ' selected' : ''}`} onClick={() => onChange(key)}><i/><span>{THEME_LABELS[key]}</span></button>)}</div></div>
}

function AdjustmentForm({ card, money, onSubmit }: { card: WalletCard; money: (value: number) => string; onSubmit: (target: number, note: string) => void }) {
  const [target, setTarget] = useState(String(card.balance))
  const [note, setNote] = useState('')
  const delta = Number(target) - card.balance
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(Number(target), note) }}><span className="eyebrow">Balance adjustment</span><h2>{card.name}</h2><p>Use this only when the tracked balance no longer matches the real account.</p><div className="comparison"><div><small>Current</small><b>{money(card.balance)}</b></div><ArrowRight/><div><small>After</small><b>{money(Number(target) || 0)}</b></div></div><Field label="Correct balance"><input autoFocus type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)}/></Field><Field label="Reason (optional)"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Matched bank balance"/></Field><div className="inline-note">Adjustment: {delta >= 0 ? '+' : '−'}{money(Math.abs(delta))}</div><button className="btn primary full" disabled={!Number.isFinite(Number(target)) || Number(target) < 0}>Apply adjustment</button></form>
}

function TransactionForm({ mode, currency, cards, defaultCardId, onSubmit }: { mode: 'expense' | 'income'; currency: string; cards: WalletCard[]; defaultCardId?: string; onSubmit: (mode: 'expense' | 'income', cardId: string, amount: number, category: string, note: string) => void }) {
  const [cardId, setCardId] = useState(defaultCardId || cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(mode === 'expense' ? 'Food & Drinks' : 'Allowance')
  const [note, setNote] = useState('')
  const source = cards.find((card) => card.id === cardId)
  const invalid = Number(amount) <= 0 || (mode === 'expense' && Number(amount) > (source?.balance || 0))
  const categories = mode === 'expense' ? ['Food & Drinks','Transportation','Shopping','Bills','School','Entertainment','Health','Other'] : ['Allowance','Salary','Freelance','Gift','Refund','Other']
  return <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onSubmit(mode, cardId, Number(amount), category, note) }}><span className="eyebrow">{mode === 'expense' ? 'Spend' : 'Receive'}</span><h2>{mode === 'expense' ? 'Add expense' : 'Add income'}</h2><AmountField currency={currency} value={amount} onChange={setAmount}/><Field label={mode === 'expense' ? 'From card' : 'To card'}><select value={cardId} onChange={(event) => setCardId(event.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Note (optional)"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === 'expense' ? 'Coffee with friends' : 'Weekly allowance'}/></Field>{mode === 'expense' && Number(amount) > (source?.balance || 0) && <div className="error">That amount is higher than this card's balance.</div>}<button className="btn primary full" disabled={invalid}>{mode === 'expense' ? 'Add expense' : 'Add income'}</button></form>
}

function AmountField({ currency, value, onChange }: { currency: string; value: string; onChange: (value: string) => void }) {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₱'
  return <label className="amount-field"><span>Amount</span><div><b>{symbol}</b><input autoFocus type="number" min="0.01" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0.00"/></div></label>
}

function TransferForm({ currency, cards, defaultFromId, onSubmit }: { currency: string; cards: WalletCard[]; defaultFromId?: string; onSubmit: (fromId: string, toId: string, amount: number) => void }) {
  const [fromId, setFrom] = useState(defaultFromId || cards[0]?.id || '')
  const firstOther = cards.find((card) => card.id !== (defaultFromId || cards[0]?.id))
  const [toId, setTo] = useState(firstOther?.id || cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const source = cards.find((card) => card.id === fromId)
  const destination = cards.find((card) => card.id === toId)
  const numeric = Number(amount)
  const invalid = fromId === toId || numeric <= 0 || numeric > (source?.balance || 0)
  const formatter = moneyFormatter(currency)
  return <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onSubmit(fromId, toId, numeric) }}><span className="eyebrow">Transfer</span><h2>Move money</h2><p>This changes two card balances but never counts as spending.</p><Field label="From"><select value={fromId} onChange={(event) => setFrom(event.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="To"><select value={toId} onChange={(event) => setTo(event.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><AmountField currency={currency} value={amount} onChange={setAmount}/>{source && destination && numeric > 0 && !invalid && <div className="transfer-preview"><div><small>{source.name} after</small><b>{formatter.format(source.balance - numeric)}</b></div><ArrowRight/><div><small>{destination.name} after</small><b>{formatter.format(destination.balance + numeric)}</b></div></div>}{fromId === toId && <div className="error">Choose two different cards.</div>}{numeric > (source?.balance || 0) && <div className="error">Not enough money on the source card.</div>}<button className="btn primary full" disabled={invalid}>Move money</button></form>
}

function TransactionDetail({ tx, state, money, onUpdate, onDelete }: { tx: Tx; state: WalletState; money: (value: number) => string; onUpdate: (previous: Tx, next: Tx) => void; onDelete: () => void }) {
  const editable = tx.kind === 'expense' || tx.kind === 'income' || (tx.kind === 'transfer' && !tx.goalId)
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(tx.amount))
  const [cardId, setCardId] = useState(tx.cardId || '')
  const [fromId, setFrom] = useState(tx.fromId || '')
  const [toId, setTo] = useState(tx.toId || '')
  const [category, setCategory] = useState(tx.category || 'Other')
  const [note, setNote] = useState(tx.note || tx.title)
  const cardName = (value?: string) => state.cards.find((card) => card.id === value)?.name || 'Card'
  const save = () => {
    const numeric = Number(amount)
    if (numeric <= 0) return
    const next: Tx = tx.kind === 'transfer'
      ? { ...tx, amount: numeric, fromId, toId }
      : { ...tx, amount: numeric, cardId, category, note, title: note.trim() || category }
    onUpdate(tx, next)
  }
  return <><span className="eyebrow">Transaction</span><h2>{tx.title}</h2><div className="transaction-amount">{tx.kind === 'expense' || tx.kind === 'debt-payment' ? '−' : tx.kind === 'income' || tx.kind === 'repayment' ? '+' : ''}{money(tx.amount)}</div>{editing ? <div><Field label="Amount"><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)}/></Field>{tx.kind === 'transfer' ? <><Field label="From"><select value={fromId} onChange={(event) => setFrom(event.target.value)}>{state.cards.filter((card) => !card.archived).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="To"><select value={toId} onChange={(event) => setTo(event.target.value)}>{state.cards.filter((card) => !card.archived).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field></> : <><Field label="Card"><select value={cardId} onChange={(event) => setCardId(event.target.value)}>{state.cards.filter((card) => !card.archived).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="Category"><input value={category} onChange={(event) => setCategory(event.target.value)}/></Field><Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)}/></Field></>}<button className="btn primary full" disabled={tx.kind === 'transfer' && fromId === toId} onClick={save}>Save changes</button></div> : <div className="detail-list"><div><span>Type</span><b>{tx.kind.replace('-', ' ')}</b></div><div><span>{tx.kind === 'transfer' ? 'From / To' : 'Card'}</span><b>{tx.kind === 'transfer' ? `${cardName(tx.fromId)} → ${cardName(tx.toId)}` : cardName(tx.cardId)}</b></div>{tx.category && <div><span>Category</span><b>{tx.category}</b></div>}<div><span>Date</span><b>{new Date(tx.createdAt).toLocaleString()}</b></div></div>}{editable && !editing && <button className="btn secondary full" onClick={() => setEditing(true)}><Pencil/> Edit transaction</button>}<button className="danger full-action" onClick={onDelete}><Trash2/> Delete transaction</button></>
}

function GoalForm({ cards, onSubmit }: { cards: WalletCard[]; onSubmit: (draft: Omit<Goal, 'id' | 'current'>) => void }) {
  const savings = cards.filter((card) => card.kind === 'Savings')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [linkedCardId, setLinkedCardId] = useState(savings[0]?.id || cards[0]?.id || '')
  const [targetDate, setTargetDate] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); if (Number(target) > 0 && linkedCardId) onSubmit({ name: name.trim() || 'Savings Goal', target: Number(target), linkedCardId, targetDate: targetDate || undefined, icon: 'goal' }) }}><span className="eyebrow">Savings</span><h2>New goal</h2><p>Link the goal to a real card so progress reflects actual money movement.</p><Field label="Goal name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="New Laptop"/></Field><Field label="Target amount"><input type="number" min="1" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="50000"/></Field><Field label="Savings card"><select value={linkedCardId} onChange={(event) => setLinkedCardId(event.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.kind}</option>)}</select></Field><Field label="Target date (optional)"><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)}/></Field><button className="btn primary full">Create goal</button></form>
}

function GoalDepositForm({ currency, goal, cards, money, onSubmit }: { currency: string; goal: Goal; cards: WalletCard[]; money: (value: number) => string; onSubmit: (fromId: string, amount: number) => void }) {
  const destination = cards.find((card) => card.id === goal.linkedCardId)
  const sourceOptions = cards.filter((card) => card.id !== goal.linkedCardId)
  const [fromId, setFromId] = useState(sourceOptions[0]?.id || '')
  const [amount, setAmount] = useState('')
  const source = cards.find((card) => card.id === fromId)
  const numeric = Number(amount)
  const remaining = Math.max(0, goal.target - goal.current)
  const invalid = !source || !destination || numeric <= 0 || numeric > source.balance || numeric > remaining
  const pct = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
  return <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onSubmit(fromId, numeric) }}><span className="eyebrow">Savings goal</span><h2>{goal.name}</h2><div className="goal-progress-large"><div><span>{money(goal.current)} of {money(goal.target)}</span><b>{pct}%</b></div><div className="bar"><i style={{ width: `${pct}%` }}/></div></div><Field label="From card"><select value={fromId} onChange={(event) => setFromId(event.target.value)}>{sourceOptions.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><AmountField currency={currency} value={amount} onChange={setAmount}/>{destination && <div className="inline-note">Money will move into {destination.name}. This is a transfer, not an expense.</div>}<button className="btn primary full" disabled={invalid}>Add to goal</button></form>
}

function DebtForm({ onSubmit }: { onSubmit: (draft: Omit<Debt, 'id' | 'remaining' | 'payments'>) => void }) {
  const [direction, setDirection] = useState<Debt['direction']>('owe')
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); if (Number(amount) > 0) onSubmit({ direction, person: person.trim() || 'Someone', original: Number(amount), due: due || undefined, note: note.trim() || undefined }) }}><span className="eyebrow">People & debts</span><h2>Add a record</h2><div className="segments wide"><button type="button" className={direction === 'owe' ? 'active' : ''} onClick={() => setDirection('owe')}>I owe</button><button type="button" className={direction === 'owedToMe' ? 'active' : ''} onClick={() => setDirection('owedToMe')}>Owed to me</button></div><Field label="Person"><input autoFocus value={person} onChange={(event) => setPerson(event.target.value)} placeholder="Mom"/></Field><Field label="Amount"><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1500"/></Field><Field label="Due date (optional)"><input type="date" value={due} onChange={(event) => setDue(event.target.value)}/></Field><Field label="Note (optional)"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="For laptop"/></Field><button className="btn primary full">Save record</button></form>
}

function DebtDetail({ currency, debt, cards, money, onPay }: { currency: string; debt: Debt; cards: WalletCard[]; money: (value: number) => string; onPay: (cardId: string, amount: number) => void }) {
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const card = cards.find((item) => item.id === cardId)
  const numeric = Number(amount)
  const invalid = numeric <= 0 || numeric > debt.remaining || (debt.direction === 'owe' && numeric > (card?.balance || 0))
  const paid = debt.original - debt.remaining
  const pct = debt.original ? Math.min(100, Math.round((paid / debt.original) * 100)) : 0
  return <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onPay(cardId, numeric) }}><span className="eyebrow">{debt.direction === 'owe' ? 'I owe' : 'Owed to me'}</span><h2>{debt.person}</h2><div className="debt-hero"><span>Remaining</span><b>{money(debt.remaining)}</b><small>Paid / received {money(paid)} of {money(debt.original)} · {pct}%</small></div>{debt.due && <div className="inline-note"><CalendarDays/> Due {new Date(`${debt.due}T00:00:00`).toLocaleDateString()}</div>}{debt.note && <div className="inline-note">{debt.note}</div>}{debt.remaining > 0 && <><Field label={debt.direction === 'owe' ? 'Pay from card' : 'Receive into card'}><select value={cardId} onChange={(event) => setCardId(event.target.value)}>{cards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><AmountField currency={currency} value={amount} onChange={setAmount}/><button className="btn primary full" disabled={invalid}>{debt.direction === 'owe' ? 'Record payment' : 'Record repayment'}</button></>}<div className="payment-history"><h3>Payment history</h3>{debt.payments.length ? debt.payments.map((payment) => <div key={payment.id}><span>{new Date(payment.createdAt).toLocaleDateString()}</span><b>{money(payment.amount)}</b></div>) : <p>No payments recorded yet.</p>}</div></form>
}

function Settings({ state, onLock, onManage, onExport, onImport, onReset }: { state: WalletState; onLock: () => void; onManage: () => void; onExport: () => void; onImport: () => void; onReset: () => void }) {
  return <><span className="eyebrow">Pocket Wallet</span><h2>Settings</h2><p>Local-first by design. Your wallet is stored in IndexedDB on this device.</p><div className="settings-list"><button onClick={onManage}><WalletCards/><span><b>Manage cards</b><small>Reorder, edit, archive</small></span><ChevronRight/></button><button onClick={onExport}><Download/><span><b>Encrypted backup</b><small>Export a password-protected file</small></span><ChevronRight/></button><button onClick={onImport}><Upload/><span><b>Restore backup</b><small>Import an encrypted Pocket Wallet backup</small></span><ChevronRight/></button>{state.profile.pin && <button onClick={onLock}><LockKeyhole/><span><b>Lock now</b><small>Require your PIN again</small></span><ChevronRight/></button>}</div><button className="danger full-action" onClick={() => { if (window.confirm('Reset Pocket Wallet and permanently delete local data on this device?')) onReset() }}><Trash2/> Reset local wallet</button></>
}

function ManageCards({ cards, money, onMove, onEdit }: { cards: WalletCard[]; money: (value: number) => string; onMove: (id: string, direction: -1 | 1) => void; onEdit: (id: string) => void }) {
  return <><span className="eyebrow">Wallet</span><h2>Manage cards</h2><p>Order controls how cards appear in your wallet. Archived cards stay out of the active wallet.</p><div className="manage-cards">{cards.map((card, index) => <div key={card.id} className={card.archived ? 'archived' : ''}><span className={`account-icon theme-${card.theme}`}>{cardIcon(card.kind)}</span><span><b>{card.name}</b><small>{card.archived ? 'Archived' : money(card.balance)}</small></span><button disabled={index === 0} onClick={() => onMove(card.id, -1)} aria-label={`Move ${card.name} up`}><ArrowUp/></button><button disabled={index === cards.length - 1} onClick={() => onMove(card.id, 1)} aria-label={`Move ${card.name} down`}><ArrowDown/></button><button onClick={() => onEdit(card.id)} aria-label={`Edit ${card.name}`}><Pencil/></button></div>)}</div></>
}

function BackupExport({ state }: { state: WalletState }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    if (password.length < 8 || password !== confirm) { setError('Use matching backup passwords with at least 8 characters.'); return }
    setBusy(true); setError('')
    try {
      const content = await encryptBackup(state, password)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pocket-wallet-${new Date().toISOString().slice(0,10)}.pocket`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch { setError('Could not create the encrypted backup.') } finally { setBusy(false) }
  }
  return <><span className="eyebrow">Data & backup</span><h2>Encrypted backup</h2><p>Create a password-protected file you can store somewhere safe. Pocket Wallet cannot recover this password for you.</p><Field label="Backup password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)}/></Field><Field label="Confirm password"><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/></Field>{error && <div className="error">{error}</div>}<button className="btn primary full" disabled={busy} onClick={run}>{busy ? 'Encrypting…' : 'Download encrypted backup'}</button></>
}

function BackupImport({ onImport }: { onImport: (state: WalletState) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    if (!file || !password) return
    setBusy(true); setError('')
    try { onImport(await decryptBackup(await file.text(), password)) } catch { setError('The backup or password is not valid.') } finally { setBusy(false) }
  }
  return <><span className="eyebrow">Data & backup</span><h2>Restore wallet</h2><p>This replaces the wallet currently stored on this device.</p><Field label="Backup file"><input type="file" accept=".pocket,application/json" onChange={(event) => setFile(event.target.files?.[0] || null)}/></Field><Field label="Backup password"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)}/></Field>{error && <div className="error">{error}</div>}<button className="btn primary full" disabled={busy || !file || !password} onClick={run}>{busy ? 'Restoring…' : 'Restore backup'}</button></>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }

function GoalCard({ goal, state, money, onClick }: { goal: Goal; state: WalletState; money: (value: number) => string; onClick: () => void }) {
  const pct = goal.target ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0
  const card = state.cards.find((item) => item.id === goal.linkedCardId)
  return <button className="goal-card" onClick={onClick}><div><b>{goal.name}</b><span>{card ? `Linked to ${card.name}` : 'No linked card'}</span></div><strong>{money(goal.current)} <small>of {money(goal.target)}</small></strong><div className="bar"><i style={{ width: `${pct}%` }}/></div><span>{pct}% complete{goal.targetDate ? ` · target ${new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString()}` : ''}</span></button>
}

function DebtCard({ title, items, money, onOpen }: { title: string; items: Debt[]; money: (value: number) => string; onOpen: (id: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.remaining, 0)
  return <article className="debt-card"><div className="debt-title"><HandCoins/><span><small>{title}</small><b>{money(total)}</b></span></div>{items.length ? items.map((item) => <button className="debt-row" key={item.id} onClick={() => onOpen(item.id)}><span><b>{item.person}</b><small>{item.due ? `Due ${new Date(`${item.due}T00:00:00`).toLocaleDateString()}` : 'No due date'}</small></span><strong>{money(item.remaining)}</strong><ChevronRight/></button>) : <p>Nothing active here.</p>}</article>
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><span>{label}</span><b>{value}</b></article> }
function Empty({ text }: { text: string }) { return <div className="empty"><ReceiptText/><b>Nothing here yet</b><span>{text}</span></div> }
