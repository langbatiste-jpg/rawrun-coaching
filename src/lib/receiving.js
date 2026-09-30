// Contrôle de réception : commande fournisseur ↔ articles scannés ↔ facture.

// Retrouve un produit à partir d'un code scanné ou tapé (code-barres EAN ou code article)
export function findProduct(products = [], raw = '') {
  const code = String(raw).trim().toUpperCase()
  if (!code) return null
  const digits = code.replace(/^0+/, '')
  return products.find(p => p.barcode && (String(p.barcode).toUpperCase() === code || String(p.barcode).replace(/^0+/, '') === digits))
    || products.find(p => p.sku && String(p.sku).toUpperCase() === code)
    || null
}

// État de chaque ligne et totaux
export function reconcile(lines = [], { invoice_amount_cents = null, shipping_cents = 0 } = {}) {
  const rows = lines.map(l => {
    const diff = (l.qty_received || 0) - (l.qty_ordered || 0)
    const status = !l.qty_ordered ? 'non_commande' : diff === 0 ? 'ok' : diff < 0 ? (l.qty_received ? 'partiel' : 'manquant') : 'en_trop'
    return { ...l, diff, status, received_value: (l.qty_received || 0) * (l.unit_cost_cents || 0), ordered_value: (l.qty_ordered || 0) * (l.unit_cost_cents || 0) }
  })
  const orderedQty = rows.reduce((s, r) => s + (r.qty_ordered || 0), 0)
  const receivedQty = rows.reduce((s, r) => s + (r.qty_received || 0), 0)
  const orderedValue = rows.reduce((s, r) => s + r.ordered_value, 0)
  const receivedValue = rows.reduce((s, r) => s + r.received_value, 0)
  const expectedInvoice = receivedValue + (shipping_cents || 0)
  const invoiceGap = invoice_amount_cents === null || invoice_amount_cents === undefined || invoice_amount_cents === '' ? null : invoice_amount_cents - expectedInvoice
  const issues = rows.filter(r => r.status !== 'ok')
  return {
    rows, orderedQty, receivedQty, orderedValue, receivedValue, expectedInvoice, invoiceGap,
    missing: rows.filter(r => r.diff < 0).reduce((s, r) => s + -r.diff, 0),
    extra: rows.filter(r => r.diff > 0).reduce((s, r) => s + r.diff, 0),
    complete: rows.length > 0 && issues.length === 0 && (invoiceGap === null || Math.abs(invoiceGap) <= 1),
    progress: orderedQty ? rows.reduce((s, r) => s + Math.min(r.qty_received || 0, r.qty_ordered || 0), 0) / orderedQty : 0,
  }
}

// Coût moyen pondéré après une entrée en stock
export function weightedCost(currentQty = 0, currentCost = 0, inQty = 0, inCost = 0) {
  const q = Math.max(0, currentQty) + inQty
  return q > 0 ? Math.round((Math.max(0, currentQty) * currentCost + inQty * inCost) / q) : inCost
}

export const STATUS_LABEL = { ok: 'Conforme', manquant: 'Manquant', partiel: 'Incomplet', en_trop: 'En trop', non_commande: 'Non commandé' }
export const STATUS_COLOR = { ok: 'var(--lime)', manquant: 'var(--danger)', partiel: 'var(--gold)', en_trop: 'var(--gold)', non_commande: 'var(--gold)' }
