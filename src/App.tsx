import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BarChart3, ChevronRight,
  Eye, EyeOff, Goal as GoalIcon, HandCoins, Home, LockKeyhole,
  Plus, ReceiptText, Settings2, Sparkles, WalletCards, X
} from 'lucide-react'
import {
  CardKind, Debt, Goal, Tx, WalletCard, WalletState,
  checkPin, loadWallet, makePin, resetWallet, saveWallet
} from './store'

type Page = 'wallet' | 'activity' | 'goals' | 'insights'
type Sheet = null | 'quick' | 'card' | 'expense' | 'income' | 'transfer' | 'goal' | 'debt' | 'settings'

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()

const emptyState: WalletState = {
  profile: { name: '', currency: 'PHP', onboarded: false, hideBalances: false },
  cards: [],
  txs: [],
  goals: [],
  debts: []
}

const cardThemes = ['sky', 'lavender', 'peach', 'mint', 'rose', 'graphite']

function starterCards(gcash: number, bank: number, cash: number): WalletCard[] {
  return [
    { id: id(), name: 'GCash', kind: 'E-Wallet', balance: gcash, theme: 'sky', order: 0 },
    { id: id(), name: 'BPI', kind: 'Bank', balance: bank, theme: 'lavender', order: 1 },
    { id: id(), name: 'Cash', kind: 'Cash', balance: cash, theme: 'peach', order: 2 },
    { id: id(), name: 'Savings', kind: 'Savings', balance: 0, theme: 'mint', order: 3 }
  ]
}

function moneyFormatter(currency: string) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency })
}

export default function App() {
  const [state, setState] = useState<WalletState | null>(null)
  const [page, setPage] = useState<Page>('wallet')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    loadWallet().then((saved) => {
      const next = saved || emptyState
      setState(next)
      setLocked(Boolean(next.profile.onboarded && next.profile.pin))
    })
  }, [])

  useEffect(() => {
    if (state) saveWallet(state).catch(console.error)
  }, [state])

  if (!state) return <div className="splash"><AppIcon/><strong>Pocket Wallet</strong></div>
  if (!state.profile.onboarded) return <Onboarding onDone={setState}/>
  if (locked && state.profile.pin) {
    return <LockScreen name={state.profile.name} onUnlock={async (pin) => {
      const ok = await checkPin(pin, state.profile.pin!)
      if (ok) setLocked(false)
      return ok
    }}/>
  }

  const formatter = moneyFormatter(state.profile.currency)
  const money = (value: number) => state.profile.hideBalances ? '••••••' : formatter.format(value)
  const cards = [...state.cards].sort((a, b) => a.order - b.order)
  const total = cards.reduce((sum, card) => sum + card.balance, 0)

  const mutate = (fn: (current: WalletState) => WalletState) => {
    setState((current) => current ? fn(current) : current)
  }

  const addCard = (name: string, kind: CardKind, balance: number, theme: string) => {
    mutate((current) => ({
      ...current,
      cards: [...current.cards, { id: id(), name, kind, balance, theme, order: current.cards.length }]
    }))
    setSheet(null)
  }

  const addTx = (kind: 'expense' | 'income', cardId: string, amount: number, category: string, note: string) => {
    mutate((current) => {
      const cards2 = current.cards.map((card) => card.id === cardId
        ? { ...card, balance: card.balance + (kind === 'income' ? amount : -amount) }
        : card)
      const tx: Tx = {
        id: id(), kind, amount, title: note || category, category, cardId, createdAt: now()
      }
      return { ...current, cards: cards2, txs: [tx, ...current.txs] }
    })
    setSheet(null)
  }

  const moveMoney = (fromId: string, toId: string, amount: number) => {
    mutate((current) => {
      const cards2 = current.cards.map((card) => {
        if (card.id === fromId) return { ...card, balance: card.balance - amount }
        if (card.id === toId) return { ...card, balance: card.balance + amount }
        return card
      })
      const tx: Tx = { id: id(), kind: 'transfer', amount, title: 'Transfer', fromId, toId, createdAt: now() }
      return { ...current, cards: cards2, txs: [tx, ...current.txs] }
    })
    setSheet(null)
  }

  const addGoal = (name: string, target: number) => {
    mutate((current) => ({ ...current, goals: [...current.goals, { id: id(), name, target, current: 0 }] }))
    setSheet(null)
  }

  const addDebt = (direction: Debt['direction'], person: string, amount: number, due?: string) => {
    mutate((current) => ({
      ...current,
      debts: [{ id: id(), direction, person, original: amount, remaining: amount, due }, ...current.debts]
    }))
    setSheet(null)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand/>
      <nav>
        <Nav icon={<Home/>} label="Wallet" active={page === 'wallet'} onClick={() => setPage('wallet')}/>
        <Nav icon={<ReceiptText/>} label="Activity" active={page === 'activity'} onClick={() => setPage('activity')}/>
        <Nav icon={<GoalIcon/>} label="Goals" active={page === 'goals'} onClick={() => setPage('goals')}/>
        <Nav icon={<BarChart3/>} label="Insights" active={page === 'insights'} onClick={() => setPage('insights')}/>
      </nav>
      <button className="sidebar-settings" onClick={() => setSheet('settings')}><Settings2/> Settings</button>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><span className="eyebrow">Pocket Wallet</span><h1>{greeting()}, {state.profile.name}.</h1><p>Your money, organized around the cards you actually use.</p></div>
        <button className="icon-btn" onClick={() => mutate((current) => ({
          ...current, profile: { ...current.profile, hideBalances: !current.profile.hideBalances }
        }))}>{state.profile.hideBalances ? <EyeOff/> : <Eye/>}</button>
      </header>

      {page === 'wallet' && <WalletPage
        cards={cards} total={total} txs={state.txs.slice(0, 6)} state={state} money={money}
        onAction={setSheet} onActivity={() => setPage('activity')}
      />}
      {page === 'activity' && <ActivityPage state={state} money={money}/>}
      {page === 'goals' && <GoalsPage state={state} money={money} onGoal={() => setSheet('goal')} onDebt={() => setSheet('debt')}/>}
      {page === 'insights' && <InsightsPage state={state} money={money}/>}
    </main>

    <nav className="bottom-nav">
      <Nav icon={<Home/>} label="Wallet" active={page === 'wallet'} onClick={() => setPage('wallet')} mobile/>
      <Nav icon={<ReceiptText/>} label="Activity" active={page === 'activity'} onClick={() => setPage('activity')} mobile/>
      <Nav icon={<GoalIcon/>} label="Goals" active={page === 'goals'} onClick={() => setPage('goals')} mobile/>
      <Nav icon={<BarChart3/>} label="Insights" active={page === 'insights'} onClick={() => setPage('insights')} mobile/>
    </nav>

    <button className="fab" onClick={() => setSheet('quick')}><Plus/></button>

    {sheet && <Sheet onClose={() => setSheet(null)}>
      {sheet === 'quick' && <QuickAdd onPick={setSheet}/>}
      {sheet === 'card' && <CardForm onSubmit={addCard}/>}
      {sheet === 'expense' && <TransactionForm mode="expense" cards={cards} onSubmit={addTx}/>}
      {sheet === 'income' && <TransactionForm mode="income" cards={cards} onSubmit={addTx}/>}
      {sheet === 'transfer' && <TransferForm cards={cards} onSubmit={moveMoney}/>}
      {sheet === 'goal' && <GoalForm onSubmit={addGoal}/>}
      {sheet === 'debt' && <DebtForm onSubmit={addDebt}/>}
      {sheet === 'settings' && <Settings
        hasPin={Boolean(state.profile.pin)}
        onLock={() => { setSheet(null); if (state.profile.pin) setLocked(true) }}
        onReset={async () => { await resetWallet(); setState(emptyState); setSheet(null) }}
      />}
    </Sheet>}
  </div>
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function AppIcon() {
  return <div className="app-icon"><WalletCards/></div>
}

function Brand() {
  return <div className="brand"><AppIcon/><strong>Pocket Wallet</strong></div>
}

function Nav({ icon, label, active, onClick, mobile = false }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; mobile?: boolean }) {
  return <button className={(mobile ? 'mobile-nav' : 'nav') + (active ? ' active' : '')} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Onboarding({ onDone }: { onDone: (state: WalletState) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('PHP')
  const [gcash, setGcash] = useState(5000)
  const [bank, setBank] = useState(10000)
  const [cash, setCash] = useState(2000)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')

  const finish = async () => {
    if (pin && (!/^\d{6}$/.test(pin) || pin !== confirmPin)) {
      setError('Use the same 6-digit PIN in both fields.')
      return
    }
    const pinRecord = pin ? await makePin(pin) : undefined
    onDone({
      profile: { name: name.trim() || 'Friend', currency, onboarded: true, hideBalances: false, pin: pinRecord },
      cards: starterCards(gcash, bank, cash),
      txs: [],
      goals: [],
      debts: []
    })
  }

  return <div className="onboard-shell"><section className="onboard">
    <div className="steps">{[0,1,2,3].map((n) => <span key={n} className={n <= step ? 'on' : ''}/>)}</div>
    <AppIcon/>
    {step === 0 && <>
      <span className="eyebrow">Welcome</span><h1>Your money, in one calm place.</h1>
      <p>Create cards for GCash, BPI, cash, savings, and anything else you use.</p>
      <Field label="What should we call you?"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex"/></Field>
      <Field label="Currency"><select value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="PHP">Philippine Peso (₱)</option><option value="USD">US Dollar ($)</option><option value="EUR">Euro (€)</option></select></Field>
    </>}
    {step === 1 && <>
      <span className="eyebrow">Starting money</span><h1>Where is your money right now?</h1>
      <p>Start with the places you use most. You can add more cards later.</p>
      <BalanceInput label="GCash" value={gcash} onChange={setGcash}/>
      <BalanceInput label="BPI / Bank" value={bank} onChange={setBank}/>
      <BalanceInput label="Cash" value={cash} onChange={setCash}/>
    </>}
    {step === 2 && <>
      <span className="eyebrow">Wallet model</span><h1>Every peso lives on a card.</h1>
      <p>Expenses leave a card. Income enters a card. Transfers move money without changing your total.</p>
      <div className="demo-stack"><div className="demo sky">GCash</div><div className="demo lavender">BPI</div><div className="demo mint">Savings</div></div>
    </>}
    {step === 3 && <>
      <span className="eyebrow">Privacy</span><h1>Protect your wallet.</h1>
      <p>Add an optional 6-digit PIN. Your PIN itself is never stored.</p>
      <Field label="6-digit PIN (optional)"><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••"/></Field>
      <Field label="Confirm PIN"><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••"/></Field>
      {error && <div className="error">{error}</div>}
    </>}
    <div className="onboard-actions">{step > 0 && <button className="btn secondary" onClick={() => setStep(step - 1)}>Back</button>}<button className="btn primary" onClick={() => step < 3 ? setStep(step + 1) : finish()}>{step < 3 ? 'Continue' : 'Open My Wallet'}</button></div>
  </section></div>
}

function LockScreen({ name, onUnlock }: { name: string; onUnlock: (pin: string) => Promise<boolean> }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  return <div className="onboard-shell"><form className="onboard lock" onSubmit={async (e) => {
    e.preventDefault()
    const ok = await onUnlock(pin)
    if (!ok) { setBad(true); setPin('') }
  }}><div className="lock-icon"><LockKeyhole/></div><span className="eyebrow">Pocket Wallet</span><h1>Welcome back, {name}.</h1><p>Enter your PIN to reveal your wallet.</p><input className="pin" autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => { setBad(false); setPin(e.target.value.replace(/\D/g, '').slice(0, 6)) }} placeholder="••••••"/>{bad && <div className="error">That PIN doesn't match.</div>}<button className="btn primary full" disabled={pin.length !== 6}>Unlock</button></form></div>
}

function WalletPage({ cards, total, txs, state, money, onAction, onActivity }: {
  cards: WalletCard[]; total: number; txs: Tx[]; state: WalletState; money: (n: number) => string;
  onAction: (sheet: Sheet) => void; onActivity: () => void
}) {
  return <>
    <section className="hero"><div><span className="eyebrow">Total balance</span><strong>{money(total)}</strong><p>{cards.length} active cards</p></div><div className="local-pill"><Sparkles/> Local & private</div></section>
    <section className="section">
      <div className="section-head"><div><span className="eyebrow">Wallet</span><h2>Your cards</h2></div><button className="text-btn" onClick={() => onAction('card')}><Plus/> Add card</button></div>
      <div className="card-stack">{cards.map((card) => <article className={'wallet-card theme-' + card.theme} key={card.id}><div><b>{card.name}</b><small>{card.kind}</small></div><span className="chip"/><strong>{money(card.balance)}</strong></article>)}</div>
      <div className="quick"><Quick icon={<ArrowUpRight/>} label="Expense" onClick={() => onAction('expense')}/><Quick icon={<ArrowDownLeft/>} label="Income" onClick={() => onAction('income')}/><Quick icon={<ArrowRightLeft/>} label="Move" onClick={() => onAction('transfer')}/></div>
    </section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">Latest</span><h2>Recent activity</h2></div><button className="text-btn" onClick={onActivity}>See all <ChevronRight/></button></div><TxList txs={txs} state={state} money={money}/></section>
  </>
}

function ActivityPage({ state, money }: { state: WalletState; money: (n: number) => string }) {
  const [filter, setFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const list = filter === 'all' ? state.txs : state.txs.filter((tx) => tx.kind === filter)
  return <section className="page"><span className="eyebrow">History</span><h2>Activity</h2><p>One timeline for money coming in, going out, and moving between cards.</p><div className="segments">{(['all','expense','income','transfer'] as const).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><TxList txs={list} state={state} money={money}/></section>
}

function GoalsPage({ state, money, onGoal, onDebt }: { state: WalletState; money: (n: number) => string; onGoal: () => void; onDebt: () => void }) {
  const owe = state.debts.filter((d) => d.direction === 'owe' && d.remaining > 0)
  const owed = state.debts.filter((d) => d.direction === 'owedToMe' && d.remaining > 0)
  return <section className="page"><span className="eyebrow">Plans & people</span><h2>Goals</h2><p>Keep savings, money you owe, and money owed to you separate from everyday spending.</p>
    <div className="section-head sub"><h3>Savings goals</h3><button className="text-btn" onClick={onGoal}><Plus/> New goal</button></div>
    <div className="goal-grid">{state.goals.length ? state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} money={money}/>) : <Empty text="No savings goals yet."/>}</div>
    <div className="section-head sub"><h3>People & debts</h3><button className="text-btn" onClick={onDebt}><Plus/> Add record</button></div>
    <div className="debt-grid"><DebtCard title="I owe" items={owe} money={money}/><DebtCard title="Owed to me" items={owed} money={money}/></div>
  </section>
}

function InsightsPage({ state, money }: { state: WalletState; money: (n: number) => string }) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
  const month = state.txs.filter((tx) => new Date(tx.createdAt) >= monthStart)
  const income = month.filter((tx) => tx.kind === 'income' || tx.kind === 'repayment').reduce((sum, tx) => sum + tx.amount, 0)
  const spent = month.filter((tx) => tx.kind === 'expense' || tx.kind === 'debt-payment').reduce((sum, tx) => sum + tx.amount, 0)
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    month.filter((tx) => tx.kind === 'expense').forEach((tx) => map.set(tx.category || 'Other', (map.get(tx.category || 'Other') || 0) + tx.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [state.txs])
  const max = Math.max(...categories.map(([, value]) => value), 1)
  return <section className="page"><span className="eyebrow">This month</span><h2>Insights</h2><p>Useful signals first. No noisy charts just because there is space.</p><div className="metric-grid"><Metric label="Income" value={money(income)}/><Metric label="Spent" value={money(spent)}/><Metric label="Net change" value={money(income - spent)}/></div><div className="panel"><h3>Spending by category</h3>{categories.length ? categories.map(([name, value]) => <div className="bar-row" key={name}><div><span>{name}</span><b>{money(value)}</b></div><div className="bar"><i style={{ width: String((value / max) * 100) + '%' }}/></div></div>) : <Empty text="Add expenses to see category insights."/>}</div></section>
}

function TxList({ txs, state, money }: { txs: Tx[]; state: WalletState; money: (n: number) => string }) {
  const cardName = (cardId?: string) => state.cards.find((card) => card.id === cardId)?.name || 'Card'
  if (!txs.length) return <Empty text="Your transactions will appear here."/>
  return <div className="tx-list">{txs.map((tx) => {
    const meta = tx.kind === 'transfer' ? cardName(tx.fromId) + ' → ' + cardName(tx.toId) : (tx.category || tx.kind) + ' · ' + cardName(tx.cardId)
    const sign = tx.kind === 'expense' || tx.kind === 'debt-payment' ? '−' : tx.kind === 'income' || tx.kind === 'repayment' ? '+' : ''
    return <div className="tx-row" key={tx.id}><div className={'tx-icon ' + tx.kind}>{tx.kind === 'expense' ? <ArrowUpRight/> : tx.kind === 'income' ? <ArrowDownLeft/> : <ArrowRightLeft/>}</div><div><b>{tx.title}</b><small>{meta}</small></div><strong className={tx.kind}>{sign}{money(tx.amount)}</strong></div>
  })}</div>
}

function Quick({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick}>{icon}<b>{label}</b></button>
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose() }}><section className="sheet"><button className="close" onClick={onClose}><X/></button>{children}</section></div>
}

function QuickAdd({ onPick }: { onPick: (value: Sheet) => void }) {
  return <><span className="eyebrow">Quick add</span><h2>What happened?</h2><p>Keep the three most common money actions one tap away.</p><div className="menu"><button onClick={() => onPick('expense')}><ArrowUpRight/><span><b>Expense</b><small>Money left a card</small></span><ChevronRight/></button><button onClick={() => onPick('income')}><ArrowDownLeft/><span><b>Income</b><small>Money entered a card</small></span><ChevronRight/></button><button onClick={() => onPick('transfer')}><ArrowRightLeft/><span><b>Move money</b><small>Card to card</small></span><ChevronRight/></button></div></>
}

function CardForm({ onSubmit }: { onSubmit: (name: string, kind: CardKind, balance: number, theme: string) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CardKind>('E-Wallet')
  const [balance, setBalance] = useState(0)
  const [theme, setTheme] = useState('sky')
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(name.trim() || 'New Card', kind, balance, theme) }}><span className="eyebrow">Wallet</span><h2>Add a card</h2><p>A card represents one real place your money lives.</p><Field label="Card name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="GCash"/></Field><Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value as CardKind)}><option>E-Wallet</option><option>Bank</option><option>Cash</option><option>Savings</option><option>Custom</option></select></Field><Field label="Current balance"><input type="number" min="0" step="0.01" value={balance} onChange={(e) => setBalance(Number(e.target.value))}/></Field><div className="themes">{cardThemes.map((item) => <button type="button" key={item} className={'theme-' + item + (theme === item ? ' selected' : '')} onClick={() => setTheme(item)}/>)}</div><button className="btn primary full">Create card</button></form>
}

function TransactionForm({ mode, cards, onSubmit }: { mode: 'expense' | 'income'; cards: WalletCard[]; onSubmit: (mode: 'expense' | 'income', cardId: string, amount: number, category: string, note: string) => void }) {
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(mode === 'expense' ? 'Food & Drinks' : 'Allowance')
  const [note, setNote] = useState('')
  const source = cards.find((card) => card.id === cardId)
  const invalid = Number(amount) <= 0 || (mode === 'expense' && Number(amount) > (source?.balance || 0))
  const categories = mode === 'expense' ? ['Food & Drinks','Transportation','Shopping','Bills','School','Entertainment','Health','Other'] : ['Allowance','Salary','Freelance','Gift','Refund','Other']
  return <form onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit(mode, cardId, Number(amount), category, note) }}><span className="eyebrow">{mode === 'expense' ? 'Spend' : 'Receive'}</span><h2>{mode === 'expense' ? 'Add expense' : 'Add income'}</h2><Field label="Amount"><input autoFocus type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"/></Field><Field label={mode === 'expense' ? 'From card' : 'To card'}><select value={cardId} onChange={(e) => setCardId(e.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'expense' ? 'Coffee with friends' : 'Weekly allowance'}/></Field>{mode === 'expense' && Number(amount) > (source?.balance || 0) && <div className="error">That amount is higher than this card's balance.</div>}<button className="btn primary full" disabled={invalid}>Save {mode}</button></form>
}

function TransferForm({ cards, onSubmit }: { cards: WalletCard[]; onSubmit: (fromId: string, toId: string, amount: number) => void }) {
  const [fromId, setFrom] = useState(cards[0]?.id || '')
  const [toId, setTo] = useState(cards[1]?.id || cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const source = cards.find((card) => card.id === fromId)
  const invalid = fromId === toId || Number(amount) <= 0 || Number(amount) > (source?.balance || 0)
  return <form onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit(fromId, toId, Number(amount)) }}><span className="eyebrow">Transfer</span><h2>Move money</h2><p>Transfers change two cards but never your total wallet balance.</p><Field label="From"><select value={fromId} onChange={(e) => setFrom(e.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="To"><select value={toId} onChange={(e) => setTo(e.target.value)}>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="Amount"><input autoFocus type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"/></Field>{fromId === toId && <div className="error">Choose two different cards.</div>}{Number(amount) > (source?.balance || 0) && <div className="error">Not enough money on the source card.</div>}<button className="btn primary full" disabled={invalid}>Move money</button></form>
}

function GoalForm({ onSubmit }: { onSubmit: (name: string, target: number) => void }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  return <form onSubmit={(e) => { e.preventDefault(); if (Number(target) > 0) onSubmit(name || 'Savings Goal', Number(target)) }}><span className="eyebrow">Savings</span><h2>New goal</h2><Field label="Goal name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="New Laptop"/></Field><Field label="Target amount"><input type="number" min="1" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50000"/></Field><button className="btn primary full">Create goal</button></form>
}

function DebtForm({ onSubmit }: { onSubmit: (direction: Debt['direction'], person: string, amount: number, due?: string) => void }) {
  const [direction, setDirection] = useState<Debt['direction']>('owe')
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  return <form onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) onSubmit(direction, person || 'Someone', Number(amount), due || undefined) }}><span className="eyebrow">People & debts</span><h2>Add a record</h2><div className="segments wide"><button type="button" className={direction === 'owe' ? 'active' : ''} onClick={() => setDirection('owe')}>I owe</button><button type="button" className={direction === 'owedToMe' ? 'active' : ''} onClick={() => setDirection('owedToMe')}>Owed to me</button></div><Field label="Person"><input autoFocus value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Mom"/></Field><Field label="Amount"><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500"/></Field><Field label="Due date (optional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)}/></Field><button className="btn primary full">Save record</button></form>
}

function Settings({ hasPin, onLock, onReset }: { hasPin: boolean; onLock: () => void; onReset: () => void }) {
  return <><span className="eyebrow">Pocket Wallet</span><h2>Settings</h2><p>Your financial data is stored in IndexedDB on this device.</p><div className="settings"><div><span>Storage</span><b>Local only</b></div><div><span>App lock</span><b>{hasPin ? 'PIN enabled' : 'No PIN'}</b></div></div>{hasPin && <button className="btn secondary full" onClick={onLock}>Lock now</button>}<button className="danger" onClick={() => { if (confirm('Reset Pocket Wallet and delete local data on this device?')) onReset() }}>Reset local wallet</button></>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

function BalanceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="balance-input"><span>{label}</span><div>₱ <input type="number" min="0" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))}/></div></div>
}

function GoalCard({ goal, money }: { goal: Goal; money: (n: number) => string }) {
  const pct = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
  return <article className="goal-card"><b>{goal.name}</b><span>{money(goal.current)} of {money(goal.target)}</span><div className="bar"><i style={{ width: String(pct) + '%' }}/></div><small>{pct}% complete</small></article>
}

function DebtCard({ title, items, money }: { title: string; items: Debt[]; money: (n: number) => string }) {
  const total = items.reduce((sum, item) => sum + item.remaining, 0)
  return <article className="debt-card"><div className="debt-title"><HandCoins/><span><small>{title}</small><b>{money(total)}</b></span></div>{items.length ? items.map((item) => <div className="debt-row" key={item.id}><span><b>{item.person}</b><small>{item.due ? 'Due ' + item.due : 'No due date'}</small></span><strong>{money(item.remaining)}</strong></div>) : <p>Nothing active here.</p>}</article>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric"><span>{label}</span><b>{value}</b></article>
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><ReceiptText/><b>Nothing here yet</b><span>{text}</span></div>
}
