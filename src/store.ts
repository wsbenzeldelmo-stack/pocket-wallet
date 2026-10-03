
export type CardKind = 'E-Wallet' | 'Bank' | 'Cash' | 'Savings' | 'Custom'
export type TxKind = 'expense' | 'income' | 'transfer' | 'adjustment' | 'debt-payment' | 'repayment'

export interface WalletCard {
  id: string
  name: string
  kind: CardKind
  balance: number
  theme: string
  order: number
  last4?: string
  archived?: boolean
}

export interface Tx {
  id: string
  kind: TxKind
  amount: number
  title: string
  category?: string
  cardId?: string
  fromId?: string
  toId?: string
  debtId?: string
  goalId?: string
  note?: string
  delta?: number
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  target: number
  current: number
  linkedCardId?: string
  targetDate?: string
  icon?: string
}

export interface DebtPayment {
  id: string
  txId: string
  amount: number
  cardId: string
  createdAt: string
}

export interface Debt {
  id: string
  direction: 'owe' | 'owedToMe'
  person: string
  original: number
  remaining: number
  due?: string
  note?: string
  payments: DebtPayment[]
}

export interface PinRecord {
  salt: string
  hash: string
}

export interface WalletState {
  profile: {
    name: string
    currency: string
    onboarded: boolean
    hideBalances: boolean
    hideOnOpen?: boolean
    pin?: PinRecord
  }
  cards: WalletCard[]
  txs: Tx[]
  goals: Goal[]
  debts: Debt[]
}

const DB_NAME = 'pocket-wallet'
const STORE = 'state'
const KEY = 'wallet'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function normalizeWallet(input: WalletState): WalletState {
  return {
    ...input,
    profile: {
      name: input.profile?.name || '',
      currency: input.profile?.currency || 'PHP',
      onboarded: Boolean(input.profile?.onboarded),
      hideBalances: Boolean(input.profile?.hideBalances),
      hideOnOpen: Boolean(input.profile?.hideOnOpen),
      pin: input.profile?.pin,
    },
    cards: (input.cards || []).map((card, index) => ({
      ...card,
      order: Number.isFinite(card.order) ? card.order : index,
      archived: Boolean(card.archived),
    })),
    txs: input.txs || [],
    goals: (input.goals || []).map((goal) => ({ ...goal, current: Number(goal.current || 0) })),
    debts: (input.debts || []).map((debt) => ({ ...debt, payments: debt.payments || [] })),
  }
}

export async function loadWallet(): Promise<WalletState | null> {
  const db = await openDb()
  const result = await new Promise<WalletState | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result ? normalizeWallet(result) : null
}

export async function saveWallet(state: WalletState): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(state, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function resetWallet(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function to64(bytes: Uint8Array): string {
  let value = ''
  bytes.forEach((byte) => { value += String.fromCharCode(byte) })
  return btoa(value)
}

function from64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function derivePin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 175000 },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function makePin(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: to64(salt), hash: to64(await derivePin(pin, salt)) }
}

export async function checkPin(pin: string, record: PinRecord): Promise<boolean> {
  const actual = await derivePin(pin, from64(record.salt))
  const expected = from64(record.hash)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < actual.length; index += 1) diff |= actual[index] ^ expected[index]
  return diff === 0
}

async function deriveBackupKey(password: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const source = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250000 },
    source,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

export async function encryptBackup(state: WalletState, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveBackupKey(password, salt, ['encrypt'])
  const payload = encoder.encode(JSON.stringify({ version: 1, state }))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload)
  return JSON.stringify({
    format: 'pocket-wallet-encrypted-backup',
    version: 1,
    salt: to64(salt),
    iv: to64(iv),
    data: to64(new Uint8Array(encrypted)),
  })
}

export async function decryptBackup(content: string, password: string): Promise<WalletState> {
  const parsed = JSON.parse(content) as { format?: string; salt: string; iv: string; data: string }
  if (parsed.format !== 'pocket-wallet-encrypted-backup') throw new Error('Not a Pocket Wallet encrypted backup.')
  const salt = from64(parsed.salt)
  const iv = from64(parsed.iv)
  const key = await deriveBackupKey(password, salt, ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, from64(parsed.data))
  const decoded = JSON.parse(decoder.decode(plain)) as { state?: WalletState }
  if (!decoded.state) throw new Error('Backup is missing wallet data.')
  return normalizeWallet(decoded.state)
}
