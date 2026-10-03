export type CardKind = 'E-Wallet' | 'Bank' | 'Cash' | 'Savings' | 'Custom'
export type TxKind = 'expense' | 'income' | 'transfer' | 'debt-payment' | 'repayment'

export interface WalletCard {
  id: string
  name: string
  kind: CardKind
  balance: number
  theme: string
  order: number
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
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  target: number
  current: number
}

export interface Debt {
  id: string
  direction: 'owe' | 'owedToMe'
  person: string
  original: number
  remaining: number
  due?: string
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
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadWallet(): Promise<WalletState | null> {
  const db = await openDb()
  const result = await new Promise<WalletState | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result || null
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
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 },
    key,
    256
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
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i]
  return diff === 0
}
