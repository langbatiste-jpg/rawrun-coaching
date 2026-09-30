// Moteur de calcul comptable (dans le navigateur, à partir des données Supabase).
// Montants en centimes. Hypothèse : tout est payé comptant (pas de créances/dettes fournisseurs).

export const CATEGORIES = {
  recette: [
    { name: 'Prestations de coaching', account: '706', group: 'services' },
    { name: 'Ventes de marchandises', account: '707', group: 'sales' },
    { name: 'Autres produits', account: '758', group: 'other' },
  ],
  depense: [
    { name: 'Achats de marchandises', account: '607', variable: true },
    { name: "Frais d'expédition", account: '624', variable: true },
    { name: 'Emballages', account: '6026', variable: true },
    { name: 'Frais de paiement (Stripe)', account: '627', variable: true },
    { name: 'Cotisations URSSAF', account: '646', variable: true },
    { name: 'Logiciels & abonnements', account: '6181' },
    { name: 'Nom de domaine & hébergement', account: '6181' },
    { name: 'Publicité & communication', account: '623' },
    { name: 'Matériel & équipement', account: '6063' },
    { name: 'Déplacements', account: '625' },
    { name: 'Formation', account: '6185' },
    { name: 'Frais bancaires', account: '627' },
    { name: 'Autres charges', account: '628' },
  ],
  apport: [{ name: 'Apport personnel', account: '108' }],
  retrait: [{ name: 'Retrait personnel', account: '108' }],
}
export const isVariableCategory = c => !!CATEGORIES.depense.find(x => x.name === c)?.variable
export const accountOf = (kind, c) => (CATEGORIES[kind] || []).find(x => x.name === c)?.account || ''

export const euros = c => (Number(c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
export const toCents = v => Math.round(Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) * 100) || 0
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => iso(new Date())
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)

// Échéances d'une dépense récurrente jusqu'à `to` (jamais dans le futur)
export function expandRecurring(recurring = [], to = today()) {
  const out = []
  const limit = to < today() ? to : today()
  for (const r of recurring) {
    if (r.active === false || !r.start_date) continue
    const d = new Date(r.start_date + 'T12:00:00')
    const end = r.end_date && r.end_date < limit ? r.end_date : limit
    let guard = 0
    while (iso(d) <= end && guard++ < 600) {
      out.push({ id: `rec-${r.id}-${iso(d)}`, date: iso(d), kind: 'depense', category: r.category, label: r.label, amount_cents: r.amount_cents, variable: !!r.variable, supplier: r.supplier, payment: 'Prélèvement', recurring: true })
      if (r.frequency === 'year') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1)
    }
  }
  return out
}

// Ventes du site (Stripe) → recettes + frais Stripe estimés
export function entriesFromOrders(orders = [], settings = {}) {
  const pct = Number(settings.stripe_pct ?? 1.5), fixed = Number(settings.stripe_fixed_cents ?? 25)
  const out = []
  for (const o of orders) {
    if (!o.amount_cents || o.status === 'refunded') continue
    const date = String(o.created_at).slice(0, 10)
    const cat = o.kind === 'shop' ? 'Ventes de marchandises' : 'Prestations de coaching'
    out.push({ id: `ord-${o.id}`, date, kind: 'recette', category: cat, label: `${o.order_no || 'Commande'} · ${(o.items || []).map(i => i.name).join(', ')}`.slice(0, 120), amount_cents: o.amount_cents, supplier: o.name || o.email, payment: 'Stripe', auto: true })
    out.push({ id: `fee-${o.id}`, date, kind: 'depense', category: 'Frais de paiement (Stripe)', label: `Frais Stripe ${o.order_no || ''} (estimés)`, amount_cents: Math.round(o.amount_cents * pct / 100 + fixed), variable: true, supplier: 'Stripe', payment: 'Stripe', auto: true })
  }
  return out
}

// Frais Stripe aussi sur les renouvellements d'abonnement enregistrés au journal
function stripeFeesOnEntries(entries, settings) {
  const pct = Number(settings.stripe_pct ?? 1.5), fixed = Number(settings.stripe_fixed_cents ?? 25)
  return entries.filter(e => e.kind === 'recette' && e.payment === 'Stripe' && !e.auto).map(e => ({ id: `fee-${e.id}`, date: e.date, kind: 'depense', category: 'Frais de paiement (Stripe)', label: `Frais Stripe · ${e.label} (estimés)`, amount_cents: Math.round(e.amount_cents * pct / 100 + fixed), variable: true, supplier: 'Stripe', payment: 'Stripe', auto: true }))
}

export function allEntries({ entries = [], recurring = [], orders = [], settings = {} }, to) {
  return [...entries, ...expandRecurring(recurring, to), ...entriesFromOrders(orders, settings), ...stripeFeesOnEntries(entries, settings)]
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Valeur du stock à une date (somme des mouvements × coût unitaire)
export function stockValueAt(movements = [], date, { excludeInitial = false } = {}) {
  return movements.filter(m => m.date <= date && !(excludeInitial && m.type === 'initial')).reduce((s, m) => s + m.qty * (m.unit_cost_cents || 0), 0)
}
export function stockQtyByProduct(movements = [], date) {
  const q = {}
  for (const m of movements) if (!date || m.date <= date) q[m.product_id] = (q[m.product_id] || 0) + m.qty
  return q
}
const dayBefore = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - 1); return iso(x) }

// ── Compte de résultat sur une période ──
export function incomeStatement(data, from, to) {
  const all = allEntries(data, to).filter(e => inRange(e.date, from, to))
  const sum = (kind, pred = () => true) => all.filter(e => e.kind === kind && pred(e)).reduce((s, e) => s + e.amount_cents, 0)
  const movements = data.movements || []
  const initialInPeriod = movements.filter(m => m.type === 'initial' && inRange(m.date, from, to)).reduce((s, m) => s + m.qty * (m.unit_cost_cents || 0), 0)

  const services = sum('recette', e => e.category === 'Prestations de coaching')
  const sales = sum('recette', e => e.category === 'Ventes de marchandises')
  const otherIncome = sum('recette', e => !['Prestations de coaching', 'Ventes de marchandises'].includes(e.category))
  const revenue = services + sales + otherIncome

  const purchases = sum('depense', e => e.category === 'Achats de marchandises') + initialInPeriod
  const stockStart = from ? stockValueAt(movements, dayBefore(from)) : 0
  const stockEnd = stockValueAt(movements, to)
  const stockVariation = stockStart - stockEnd                // + = déstockage
  const cogs = purchases + stockVariation                      // coût d'achat des marchandises vendues

  const byCat = {}
  for (const e of all) if (e.kind === 'depense' && e.category !== 'Achats de marchandises') byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents
  const external = Object.entries(byCat).filter(([c]) => c !== 'Cotisations URSSAF').sort((a, b) => b[1] - a[1])
  const externalTotal = external.reduce((s, [, v]) => s + v, 0)
  const social = byCat['Cotisations URSSAF'] || 0
  const charges = cogs + externalTotal + social
  const result = revenue - charges
  const s = data.settings || {}
  const urssafEstimate = Math.round(services * Number(s.urssaf_services_pct ?? 21.2) / 100 + sales * Number(s.urssaf_sales_pct ?? 12.3) / 100)
  return { from, to, services, sales, otherIncome, revenue, purchases, stockStart, stockEnd, stockVariation, cogs, external, externalTotal, social, charges, result, grossMarginGoods: sales - cogs, urssafEstimate, entries: all }
}

// ── Compte de résultat différentiel ──
export function differentialStatement(data, from, to) {
  const is = incomeStatement(data, from, to)
  const variableEntries = is.entries.filter(e => e.kind === 'depense' && e.category !== 'Achats de marchandises' && (e.variable || isVariableCategory(e.category)))
  const varByCat = {}
  for (const e of variableEntries) varByCat[e.category] = (varByCat[e.category] || 0) + e.amount_cents
  const variableCosts = is.cogs + variableEntries.reduce((s, e) => s + e.amount_cents, 0)
  const fixedCosts = is.charges - variableCosts
  const fixedByCat = {}
  for (const e of is.entries) if (e.kind === 'depense' && e.category !== 'Achats de marchandises' && !(e.variable || isVariableCategory(e.category))) fixedByCat[e.category] = (fixedByCat[e.category] || 0) + e.amount_cents
  const margin = is.revenue - variableCosts
  const marginRate = is.revenue > 0 ? margin / is.revenue : 0
  const breakEven = marginRate > 0 ? Math.round(fixedCosts / marginRate) : null
  const days = from && to ? Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1) : 365
  const breakEvenDays = breakEven && is.revenue > 0 ? Math.round(breakEven / is.revenue * days) : null
  const safetyMargin = breakEven !== null ? is.revenue - breakEven : null
  return { ...is, variableCosts, varByCat: Object.entries(varByCat).sort((a, b) => b[1] - a[1]), fixedCosts, fixedByCat: Object.entries(fixedByCat).sort((a, b) => b[1] - a[1]), margin, marginRate, breakEven, breakEvenDays, safetyMargin, days }
}

// ── Bilan à une date (depuis le début de l'activité) ──
export function balanceSheet(data, at) {
  const all = allEntries(data, at).filter(e => e.date <= at)
  const sum = kind => all.filter(e => e.kind === kind).reduce((s, e) => s + e.amount_cents, 0)
  const movements = data.movements || []
  const opening = Number(data.settings?.opening_cash_cents || 0)
  const apports = sum('apport'), retraits = sum('retrait')
  const initialStock = movements.filter(m => m.type === 'initial' && m.date <= at).reduce((s, m) => s + m.qty * (m.unit_cost_cents || 0), 0)
  const cash = opening + apports - retraits + sum('recette') - sum('depense')
  const stock = stockValueAt(movements, at)
  const result = incomeStatement(data, null, at).result
  const capital = opening + apports - retraits + initialStock
  const totalAssets = cash + stock
  const totalLiabilities = capital + result
  return { at, cash, stock, totalAssets, capital, apports, retraits, opening, initialStock, result, totalLiabilities, balanced: Math.abs(totalAssets - totalLiabilities) < 1 }
}

// Clients : commandes + athlètes regroupés par e-mail
export function clientsFrom(orders = []) {
  const map = {}
  for (const o of orders) {
    const k = (o.email || o.name || o.id).toLowerCase()
    const c = map[k] ||= { key: k, name: o.name, email: o.email, phone: o.phone, orders: 0, total: 0, last: o.created_at, first: o.created_at, subscription: null, athlete_id: null, address: null }
    c.orders++; c.total += o.amount_cents || 0
    if (o.created_at > c.last) c.last = o.created_at
    if (o.created_at < c.first) c.first = o.created_at
    if (o.kind === 'coaching') c.subscription = o.status === 'active' ? 'Abonné' : o.status === 'canceled' ? 'Résilié' : 'Coaching'
    if (o.athlete_id) c.athlete_id = o.athlete_id
    if (o.shipping?.address) c.address = o.shipping.address
    c.name ||= o.name; c.phone ||= o.phone
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

// Code article automatique : NUT-GEL-001
export function suggestSku(name = '', category = '', existing = []) {
  const clean = s => String(s).toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '').trim()
  const cat = clean(category).slice(0, 3) || 'ART'
  const word = clean(name).split(/\s+/).find(w => w.length > 2) || 'X'
  const base = `${cat}-${word.slice(0, 4)}`
  let n = 1
  while (existing.includes(`${base}-${String(n).padStart(3, '0')}`)) n++
  return `${base}-${String(n).padStart(3, '0')}`
}

// Export CSV (Excel FR : séparateur « ; », BOM UTF-8)
export function toCsv(rows, columns) {
  const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + [columns.map(c => esc(c[0])).join(';'), ...rows.map(r => columns.map(c => esc(c[1](r))).join(';'))].join('\n')
}
export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
