import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { Overlay, FG } from './ui'
import { euros, toCents, today, suggestSku } from '../lib/compta'
import { findProduct, reconcile, weightedCost, STATUS_LABEL, STATUS_COLOR } from '../lib/receiving'

const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fr2 = c => (c / 100).toFixed(2).replace('.', ',')
const PO_STATUS = { commande: 'Commandé', en_reception: 'En réception', recu: 'Reçu', annule: 'Annulé' }

// Bip + vibration à chaque scan
function feedback(ok = true) {
  try {
    const ctx = feedback.ctx ||= new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = ok ? 1320 : 220; o.type = 'square'; g.gain.value = 0.06
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.25))
  } catch {}
  try { navigator.vibrate?.(ok ? 40 : [80, 60, 80]) } catch {}
}

export default function Receptions({ products: initialProducts, reload, showToast }) {
  const [products, setProducts] = useState(initialProducts || [])
  useEffect(() => { setProducts(initialProducts || []) }, [initialProducts])
  const addProduct = p => setProducts(ps => [...ps, p])
  const [pos, setPos] = useState([])
  const [lines, setLines] = useState([])
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [labels, setLabels] = useState(null)

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_order_lines').select('*'),
    ])
    if (a.error) showToast('Lance supabase/migration_v12_receptions.sql pour activer les réceptions', 'err')
    setPos(a.data || []); setLines(b.data || [])
  }
  useEffect(() => { load() }, [])

  const po = pos.find(p => p.id === openId)
  if (po) return (
    <>
      <Receiving po={po} lines={lines.filter(l => l.po_id === po.id)} products={products} addProduct={addProduct} showToast={showToast}
        onBack={() => { setOpenId(null); load() }} onChanged={load} onDone={async (printList) => { setOpenId(null); await load(); await reload(); if (printList?.length) setLabels(printList) }} />
      <LabelSheet items={labels} onDone={() => setLabels(null)} />
    </>
  )

  const open = pos.filter(p => p.status === 'commande' || p.status === 'en_reception')
  const done = pos.filter(p => p.status === 'recu' || p.status === 'annule')
  const row = p => {
    const ls = lines.filter(l => l.po_id === p.id)
    const r = reconcile(ls)
    return (
      <button key={p.id} className="compta-line" onClick={() => setOpenId(p.id)}>
        <span className="num" style={{ color: 'var(--text-3)' }}>{p.po_no}</span>
        <span style={{ flex: 1, minWidth: 160 }}><b>{p.supplier || 'Fournisseur'}</b> <span className="muted">· {ls.length} article{ls.length > 1 ? 's' : ''} · {r.orderedQty} unités</span></span>
        <span className="muted" style={{ fontSize: 12.5 }}>{p.status === 'recu' ? `reçu le ${fmtDate(p.received_at)}` : `commandé le ${fmtDate(p.ordered_at)}`}</span>
        <b className="num">{euros(p.invoice_amount_cents ?? r.orderedValue)}</b>
        <span className="pill" style={{ background: p.status === 'recu' ? 'var(--lime-glow)' : p.status === 'annule' ? 'rgba(255,255,255,.05)' : 'var(--accent-glow)', color: p.status === 'recu' ? 'var(--lime)' : p.status === 'annule' ? 'var(--text-3)' : 'var(--accent)' }}>{PO_STATUS[p.status]}</span>
      </button>
    )
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="compta-card-head">
          <div><b>Réceptions de colis</b><div className="muted" style={{ fontSize: 13 }}>1. Bon de commande · 2. Le colis arrive : tu scannes chaque article · 3. Tu compares avec la facture · 4. Tu valides : ça entre en stock et en compta.</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => { const l = products.filter(p => p.sku).map(p => ({ product: p, qty: 1 })); l.length ? setLabels(l) : showToast("Aucun article n'a encore de code (Stock → Créer les codes)", 'err') }}>🏷 Étiquettes</button>
            <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>+ Bon de commande</button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {open.map(row)}
          {!open.length && <div className="muted" style={{ fontSize: 13.5 }}>Aucun colis attendu. Crée un bon de commande quand tu passes commande chez un fournisseur (ou quand un colis arrive).</div>}
        </div>
      </div>
      {done.length > 0 && <>
        <div className="section-title">Historique</div>
        <div style={{ display: 'grid', gap: 6 }}>{done.slice(0, 20).map(row)}</div>
      </>}
      {creating && <PoModal products={products} addProduct={addProduct} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); load().then(() => setOpenId(id)) }} showToast={showToast} />}
      <LabelSheet items={labels} onDone={() => setLabels(null)} />
    </>
  )
}

// ── Création d'un bon de commande ──
function PoModal({ products, addProduct, onClose, onSaved, showToast }) {
  const [newFor, setNewFor] = useState(null) // index de la ligne qui reçoit le nouvel article
  const [f, setF] = useState({ supplier: '', ordered_at: today(), note: '' })
  const [rows, setRows] = useState([{ product_id: products[0]?.id || '', qty: '', cost: '' }])
  const [busy, setBusy] = useState(false)
  const setRow = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * toCents(r.cost || (products.find(p => p.id === r.product_id)?.cost_cents || 0) / 100), 0)
  const save = async () => {
    const valid = rows.filter(r => r.product_id && Number(r.qty) > 0)
    if (!valid.length) return showToast('Ajoute au moins un article avec une quantité', 'err')
    setBusy(true)
    const { data: no } = await supabase.rpc('next_po_no')
    const { data: po, error } = await supabase.from('purchase_orders').insert({ po_no: no || `BC-${Date.now().toString(36).toUpperCase()}`, supplier: f.supplier || null, ordered_at: f.ordered_at, note: f.note || null }).select().single()
    if (error) { setBusy(false); return showToast(error.message, 'err') }
    await supabase.from('purchase_order_lines').insert(valid.map(r => {
      const p = products.find(x => x.id === r.product_id)
      return { po_id: po.id, product_id: r.product_id, qty_ordered: Math.round(Number(r.qty)), unit_cost_cents: r.cost ? toCents(r.cost) : (p?.cost_cents || 0) }
    }))
    setBusy(false); showToast(`Bon de commande ${po.po_no} créé ✓`); onSaved(po.id)
  }
  return (
    <Overlay onClose={onClose} wide>
      <div className="modal-title">Nouveau bon de commande</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="grid-2">
          <FG label="Fournisseur"><input className="input" value={f.supplier} onChange={e => setF(x => ({ ...x, supplier: e.target.value }))} placeholder="Maurten, Decathlon Pro, grossiste…" autoFocus /></FG>
          <FG label="Date de commande"><input className="input" type="date" value={f.ordered_at} onChange={e => setF(x => ({ ...x, ordered_at: e.target.value }))} /></FG>
        </div>
        <div className="fg-label">Articles commandés</div>
        {rows.map((r, i) => {
          const p = products.find(x => x.id === r.product_id)
          return (
            <div key={i} className="po-row">
              <select className="input" value={r.product_id} onChange={e => e.target.value === '__new' ? setNewFor(i) : setRow(i, 'product_id', e.target.value)} aria-label="Article">
                {!products.length && <option value="">Aucun article</option>}
                {products.map(x => <option key={x.id} value={x.id}>{x.sku ? `${x.sku} · ` : ''}{x.name}</option>)}
                <option value="__new">+ Nouvel article…</option>
              </select>
              <input className="input num" inputMode="numeric" placeholder="Qté" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} aria-label="Quantité" />
              <input className="input num" inputMode="decimal" placeholder={p?.cost_cents ? fr2(p.cost_cents) : 'Prix unit. €'} value={r.cost} onChange={e => setRow(i, 'cost', e.target.value)} aria-label="Prix d'achat unitaire" />
              <button className="icon-btn" aria-label="Retirer" onClick={() => setRows(x => x.filter((_, j) => j !== i))}>×</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost btn-sm" onClick={() => setRows(r => [...r, { product_id: products[0]?.id || '', qty: '', cost: '' }])}>+ Ligne</button>
          <button className="btn-ghost btn-sm" onClick={() => setNewFor(rows.length)}>+ Nouvel article (pas encore dans le site)</button>
        </div>
        {newFor !== null && <NewProduct products={products} showToast={showToast} onCancel={() => setNewFor(null)} onCreated={p => {
          addProduct(p)
          const cost = p.cost_cents ? fr2(p.cost_cents) : ''
          setRows(r => newFor < r.length ? r.map((x, j) => j === newFor ? { ...x, product_id: p.id, cost: x.cost || cost } : x) : [...r, { product_id: p.id, qty: '', cost }])
          setNewFor(null)
        }} />}
        <FG label="Note"><input className="input" value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} placeholder="N° de commande chez le fournisseur, délai…" /></FG>
        <div className="modal-foot">
          <div>Total commandé : <b className="num">{euros(total)}</b></div>
          <div style={{ display: 'flex', gap: 10 }}><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={save} disabled={busy}>{busy ? '…' : 'Créer le bon'}</button></div>
        </div>
      </div>
    </Overlay>
  )
}

// ── Écran de réception : scan + contrôle + validation ──
function Receiving({ po, lines: initialLines, products, addProduct, showToast, onBack, onChanged, onDone }) {
  const [lines, setLines] = useState(initialLines)
  const [code, setCode] = useState('')
  const [last, setLast] = useState(null) // { ok, text }
  const [camera, setCamera] = useState(false)
  const [unknown, setUnknown] = useState(null)
  const [creatingFor, setCreatingFor] = useState(null)
  const [inv, setInv] = useState({ invoice_no: po.invoice_no || '', amount: po.invoice_amount_cents != null ? fr2(po.invoice_amount_cents) : '', shipping: po.shipping_cents ? fr2(po.shipping_cents) : '' })
  const [busy, setBusy] = useState(false)
  const [keepRemainder, setKeepRemainder] = useState(true)
  const inputRef = useRef(null)
  const locked = po.status === 'recu' || po.status === 'annule'
  const r = useMemo(() => reconcile(lines, { invoice_amount_cents: inv.amount === '' ? null : toCents(inv.amount), shipping_cents: toCents(inv.shipping) }), [lines, inv])
  const name = id => products.find(p => p.id === id)

  useEffect(() => { if (!locked && po.status === 'commande') supabase.from('purchase_orders').update({ status: 'en_reception' }).eq('id', po.id) }, [])
  useEffect(() => { if (!locked && !camera) inputRef.current?.focus() }, [camera, unknown])

  const saveQty = async (line, qty) => {
    qty = Math.max(0, qty)
    setLines(ls => ls.map(l => l.id === line.id ? { ...l, qty_received: qty } : l))
    await supabase.from('purchase_order_lines').update({ qty_received: qty }).eq('id', line.id)
  }

  const handleCode = async raw => {
    const c = String(raw || '').trim()
    if (!c || locked) return
    const p = findProduct(products, c)
    if (!p) { feedback(false); setLast({ ok: false, text: `Code inconnu : ${c}` }); setUnknown(c); return }
    const line = lines.find(l => l.product_id === p.id)
    if (line) {
      const q = (line.qty_received || 0) + 1
      await saveQty(line, q)
      const over = line.qty_ordered && q > line.qty_ordered
      feedback(!over)
      setLast({ ok: !over, text: `${p.name} : ${q}/${line.qty_ordered}${over ? ' · en trop !' : q === line.qty_ordered ? ' ✓ complet' : ''}` })
    } else {
      const { data } = await supabase.from('purchase_order_lines').insert({ po_id: po.id, product_id: p.id, qty_ordered: 0, qty_received: 1, unit_cost_cents: p.cost_cents || 0 }).select().single()
      if (data) setLines(ls => [...ls, data])
      feedback(false); setLast({ ok: false, text: `${p.name} : pas dans la commande (ajouté en « non commandé »)` })
    }
  }

  const linkUnknown = async productId => {
    const code = unknown
    const { error } = await supabase.from('products').update({ barcode: code }).eq('id', productId)
    if (error) return showToast(error.message, 'err')
    const p = products.find(x => x.id === productId); if (p) p.barcode = code
    setUnknown(null); showToast('Code-barres associé ✓ Il sera reconnu la prochaine fois.')
    handleCode(code)
  }

  const saveInvoice = async () => {
    await supabase.from('purchase_orders').update({ invoice_no: inv.invoice_no || null, invoice_amount_cents: inv.amount === '' ? null : toCents(inv.amount), shipping_cents: toCents(inv.shipping) }).eq('id', po.id)
  }

  const validate = async () => {
    const received = r.rows.filter(l => l.qty_received > 0 && l.product_id)
    if (!received.length) return showToast('Aucun article reçu à entrer en stock', 'err')
    const warn = [r.missing && `${r.missing} article(s) manquant(s)`, r.extra && `${r.extra} en trop / non commandé(s)`, r.invoiceGap && Math.abs(r.invoiceGap) > 1 && `écart facture de ${euros(r.invoiceGap)}`].filter(Boolean)
    if (warn.length && !confirm(`Attention : ${warn.join(', ')}.\n\nValider quand même la réception de ce qui est arrivé ?`)) return
    setBusy(true)
    await saveInvoice()
    const date = today()
    const { data: fresh } = await supabase.from('products').select('id,stock,cost_cents').in('id', received.map(l => l.product_id))
    for (const l of received) {
      const cur = fresh?.find(x => x.id === l.product_id) || {}
      await supabase.from('stock_movements').insert({ date, product_id: l.product_id, qty: l.qty_received, type: 'achat', unit_cost_cents: l.unit_cost_cents, po_id: po.id, note: `Réception ${po.po_no}${po.supplier ? ` · ${po.supplier}` : ''}` })
      await supabase.from('products').update({ stock: (cur.stock || 0) + l.qty_received, cost_cents: weightedCost(cur.stock || 0, cur.cost_cents || 0, l.qty_received, l.unit_cost_cents) }).eq('id', l.product_id)
    }
    const invoiceTotal = inv.amount === '' ? null : toCents(inv.amount)
    const ship = toCents(inv.shipping)
    const goods = invoiceTotal !== null ? invoiceTotal - ship : r.receivedValue // on retient le montant réellement facturé
    await supabase.from('compta_entries').insert({ date, kind: 'depense', category: 'Achats de marchandises', label: `${inv.invoice_no ? `Facture ${inv.invoice_no} · ` : ''}${po.po_no} (${r.receivedQty} articles)`, amount_cents: goods, supplier: po.supplier, payment: 'CB', po_id: po.id, variable: true })
    if (ship > 0) await supabase.from('compta_entries').insert({ date, kind: 'depense', category: "Frais d'expédition", label: `Port sur ${po.po_no}`, amount_cents: ship, supplier: po.supplier, payment: 'CB', po_id: po.id, variable: true })
    // Reliquat : les manquants restent attendus dans un nouveau bon
    const missing = r.rows.filter(l => l.diff < 0 && l.product_id)
    if (keepRemainder && missing.length) {
      const { data: no } = await supabase.rpc('next_po_no')
      const { data: rest } = await supabase.from('purchase_orders').insert({ po_no: no, supplier: po.supplier, ordered_at: po.ordered_at, note: `Reliquat de ${po.po_no}` }).select().single()
      if (rest) await supabase.from('purchase_order_lines').insert(missing.map(l => ({ po_id: rest.id, product_id: l.product_id, qty_ordered: -l.diff, unit_cost_cents: l.unit_cost_cents })))
    }
    await supabase.from('purchase_orders').update({ status: 'recu', received_at: date }).eq('id', po.id)
    setBusy(false)
    showToast(`Réception validée : ${r.receivedQty} articles en stock ✓`)
    const needLabels = received.map(l => ({ product: name(l.product_id), qty: l.qty_received })).filter(x => x.product && !x.product.barcode && x.product.sku)
    onDone(needLabels.length && confirm(`Imprimer les étiquettes code-barres (${needLabels.reduce((s, x) => s + x.qty, 0)}) pour les articles sans code-barres fabricant ?`) ? needLabels : null)
  }

  const cancel = async () => { if (!confirm('Annuler ce bon de commande ?')) return; await supabase.from('purchase_orders').update({ status: 'annule' }).eq('id', po.id); onBack() }

  return (
    <div className="view-enter">
      <button className="btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 14 }}>← Réceptions</button>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <div className="display" style={{ fontSize: 40 }}>{po.po_no}</div>
          <div className="page-sub">{po.supplier || 'Fournisseur'} · commandé le {fmtDate(po.ordered_at)}{po.note ? ` · ${po.note}` : ''}{locked ? ` · ${PO_STATUS[po.status].toLowerCase()}` : ''}</div>
        </div>
        {!locked && <button className="btn-danger btn-sm" onClick={cancel}>Annuler le bon</button>}
      </div>

      {!locked && (
        <div className="card scan-card">
          <div className="scan-row">
            <input ref={inputRef} className="input num scan-input" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { handleCode(code); setCode('') } }}
              placeholder="Scanne ou tape un code + Entrée" aria-label="Code scanné" autoComplete="off" />
            <button className={camera ? 'btn-ghost' : 'btn-primary'} onClick={() => setCamera(c => !c)}>{camera ? 'Fermer la caméra' : '📷 Scanner avec la caméra'}</button>
          </div>
          {camera && <CameraScanner onCode={handleCode} onError={m => { showToast(m, 'err'); setCamera(false) }} />}
          {last && <div className="scan-last" style={{ color: last.ok ? 'var(--lime)' : 'var(--gold)' }} role="status">{last.ok ? '✓' : '⚠'} {last.text}</div>}
          <div className="progress" style={{ marginTop: 12 }} role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${r.progress * 100}%` }} /></div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{r.receivedQty} / {r.orderedQty} articles reçus{r.missing ? ` · ${r.missing} manquant${r.missing > 1 ? 's' : ''}` : ''}{r.extra ? ` · ${r.extra} en trop` : ''}</div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 14 }}>
        <table className="compta-table">
          <thead><tr><th>Article</th><th className="r">Commandé</th><th className="r">Reçu</th><th>État</th><th className="r">Prix unit.</th><th className="r">Montant reçu</th></tr></thead>
          <tbody>
            {r.rows.map(l => {
              const p = name(l.product_id)
              return (
                <tr key={l.id} className={l.status === 'ok' ? 'row-ok' : ''}>
                  <td>{p?.name || 'Article supprimé'}<div className="muted num" style={{ fontSize: 12 }}>{[p?.sku, p?.barcode].filter(Boolean).join(' · ') || 'pas de code'}</div></td>
                  <td className="r num">{l.qty_ordered}</td>
                  <td className="r">
                    {locked ? <span className="num">{l.qty_received}</span> : (
                      <div className="qty" style={{ justifyContent: 'flex-end', display: 'inline-flex' }}>
                        <button className="icon-btn" aria-label="Moins" onClick={() => saveQty(l, (l.qty_received || 0) - 1)}>−</button>
                        <input className="num qty-input" inputMode="numeric" value={l.qty_received} onChange={e => saveQty(l, Math.round(Number(e.target.value) || 0))} aria-label={`Reçu ${p?.name}`} />
                        <button className="icon-btn" aria-label="Plus" onClick={() => saveQty(l, (l.qty_received || 0) + 1)}>+</button>
                      </div>
                    )}
                  </td>
                  <td><span style={{ color: STATUS_COLOR[l.status], fontWeight: 600, fontSize: 13 }}>{l.status === 'ok' ? '✓ ' : ''}{STATUS_LABEL[l.status]}{l.diff && l.qty_ordered ? ` (${l.diff > 0 ? '+' : ''}${l.diff})` : ''}</span></td>
                  <td className="r num">{euros(l.unit_cost_cents)}</td>
                  <td className="r num">{euros(l.received_value)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="compta-grid" style={{ marginTop: 14 }}>
        <div className="card">
          <b>Contrôle de la facture</b>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <FG label="N° de facture"><input className="input num" value={inv.invoice_no} disabled={locked} onChange={e => setInv(x => ({ ...x, invoice_no: e.target.value }))} onBlur={saveInvoice} /></FG>
            <FG label="Total facture TTC (€)"><input className="input num" inputMode="decimal" value={inv.amount} disabled={locked} onChange={e => setInv(x => ({ ...x, amount: e.target.value }))} onBlur={saveInvoice} placeholder={fr2(r.expectedInvoice)} /></FG>
            <FG label="Dont frais de port (€)"><input className="input num" inputMode="decimal" value={inv.shipping} disabled={locked} onChange={e => setInv(x => ({ ...x, shipping: e.target.value }))} onBlur={saveInvoice} placeholder="0" /></FG>
          </div>
          <div className="compta-sep" />
          <div className="compta-row"><span>Articles reçus × prix</span><b className="num">{euros(r.receivedValue)}</b></div>
          <div className="compta-row"><span>+ port</span><b className="num">{euros(toCents(inv.shipping))}</b></div>
          <div className="compta-row"><span>Facture attendue</span><b className="num">{euros(r.expectedInvoice)}</b></div>
          {r.invoiceGap !== null && (
            <div className={`fs-result ${Math.abs(r.invoiceGap) <= 1 ? 'pos' : 'neg'}`}>
              <span>{Math.abs(r.invoiceGap) <= 1 ? '✓ Facture conforme' : r.invoiceGap > 0 ? 'Facturé en trop' : 'Facturé en moins'}</span>
              <span className="num">{Math.abs(r.invoiceGap) <= 1 ? '' : euros(Math.abs(r.invoiceGap))}</span>
            </div>
          )}
        </div>
        <div className="card">
          <b>{locked ? 'Réception terminée' : 'Valider la réception'}</b>
          {locked ? <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>{po.status === 'recu' ? `Entrée en stock le ${fmtDate(po.received_at)} et enregistrée en compta.` : 'Bon annulé.'}</p> : <>
            <ul className="check-list">
              <li className={r.missing === 0 ? 'ok' : ''}>{r.missing === 0 ? 'Tous les articles commandés sont là' : `${r.missing} article(s) manquant(s)`}</li>
              <li className={r.extra === 0 ? 'ok' : ''}>{r.extra === 0 ? 'Rien en trop' : `${r.extra} article(s) en trop ou non commandé(s)`}</li>
              <li className={r.invoiceGap !== null && Math.abs(r.invoiceGap) <= 1 ? 'ok' : ''}>{r.invoiceGap === null ? 'Saisis le total de la facture' : Math.abs(r.invoiceGap) <= 1 ? 'Facture conforme' : `Écart facture ${euros(r.invoiceGap)}`}</li>
            </ul>
            {r.missing > 0 && <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" checked={keepRemainder} onChange={e => setKeepRemainder(e.target.checked)} /> Garder les manquants en attente (nouveau bon « reliquat »)</label>}
            <button className={r.complete ? 'btn-lime' : 'btn-primary'} style={{ width: '100%' }} disabled={busy} onClick={validate}>{busy ? 'Entrée en stock…' : r.complete ? '✓ Tout est bon : entrer en stock' : 'Entrer en stock ce qui est arrivé'}</button>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Le stock du site et la compta ne bougent qu'à la validation.</p>
          </>}
        </div>
      </div>

      {unknown && (
        <Overlay onClose={() => setUnknown(null)}>
          <div className="modal-title">Code inconnu</div>
          <p className="muted" style={{ marginBottom: 12 }}>Le code <b className="num" style={{ color: 'var(--text)' }}>{unknown}</b> n'est associé à aucun article. C'est lequel ? Il sera reconnu automatiquement ensuite.</p>
          <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {products.map(p => <button key={p.id} className="compta-line" onClick={() => linkUnknown(p.id)}><span style={{ flex: 1 }}>{p.name}</span><span className="muted num">{p.sku || ''}</span></button>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => { setCreatingFor(unknown); setUnknown(null) }}>+ C'est un nouvel article</button>
            <button className="btn-ghost" onClick={() => setUnknown(null)}>Ignorer</button>
          </div>
        </Overlay>
      )}
      {creatingFor && (
        <Overlay onClose={() => setCreatingFor(null)}>
          <div className="modal-title">Nouvel article</div>
          <NewProduct products={products} barcode={creatingFor} showToast={showToast} onCancel={() => setCreatingFor(null)} onCreated={p => { addProduct(p); products.push(p); setCreatingFor(null); handleCode(creatingFor) }} />
        </Overlay>
      )}
    </div>
  )
}

// ── Création rapide d'une fiche article (visible dans Boutique, masquée du site tant qu'elle n'est pas activée) ──
const CATS = ['Nutrition', 'Accessoires', 'Textile', 'Matériel', 'Autre']
function NewProduct({ products, barcode = '', onCreated, onCancel, showToast }) {
  const [f, setF] = useState({ name: '', category: 'Nutrition', price: '', cost: '', barcode, sku: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const skus = products.map(p => p.sku).filter(Boolean)
  const sku = f.sku.trim().toUpperCase() || (f.name ? suggestSku(f.name, f.category, skus) : '')
  const create = async () => {
    if (!f.name.trim()) return showToast("Donne un nom à l'article", 'err')
    if (skus.includes(sku)) return showToast('Ce code article existe déjà', 'err')
    setBusy(true)
    const { data, error } = await supabase.from('products').insert({
      name: f.name.trim(), category: f.category, price_cents: toCents(f.price), cost_cents: toCents(f.cost),
      sku, barcode: f.barcode.trim() || null, stock: 0, active: false,
    }).select().single()
    setBusy(false)
    if (error) return showToast(error.message, 'err')
    showToast(`Fiche ${data.sku} créée ✓ (ajoute une photo et active-la dans Boutique pour la vendre)`)
    onCreated(data)
  }
  return (
    <div className="card new-product" style={{ display: 'grid', gap: 10 }}>
      <b>Fiche article</b>
      <div className="grid-2">
        <FG label="Nom du produit"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Gel Maurten 100 caf" autoFocus /></FG>
        <FG label="Catégorie"><select className="input" value={f.category} onChange={e => set('category', e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></FG>
      </div>
      <div className="grid-3">
        <FG label="Prix d'achat (€)"><input className="input num" inputMode="decimal" value={f.cost} onChange={e => set('cost', e.target.value)} placeholder="1,90" /></FG>
        <FG label="Prix de vente (€)"><input className="input num" inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} placeholder="3,50" /></FG>
        <FG label="Code-barres fabricant"><input className="input num" value={f.barcode} onChange={e => set('barcode', e.target.value)} placeholder="scanne-le (facultatif)" /></FG>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>Code article LANG : <b className="num" style={{ color: 'var(--text)' }}>{sku || '—'}</b>{' '}
        <input className="input num" style={{ display: 'inline-block', width: 150, marginLeft: 6, padding: '4px 8px' }} value={f.sku} onChange={e => set('sku', e.target.value.toUpperCase())} placeholder="ou le tien" aria-label="Code article personnalisé" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
        <button className="btn-primary btn-sm" onClick={create} disabled={busy}>{busy ? '…' : 'Créer la fiche'}</button>
      </div>
    </div>
  )
}

// ── Caméra du téléphone (fonctionne aussi sur iPhone) ──
function CameraScanner({ onCode, onError }) {
  const videoRef = useRef(null)
  const lastRef = useRef({ code: '', t: 0 })
  useEffect(() => {
    let controls, stopped = false
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, result => {
          if (!result || stopped) return
          const code = result.getText(), now = Date.now()
          if (code === lastRef.current.code && now - lastRef.current.t < 1500) return // évite de compter deux fois le même article
          lastRef.current = { code, t: now }
          onCode(code)
        })
      } catch (e) {
        onError(e?.name === 'NotAllowedError' ? "Autorise l'accès à la caméra dans ton navigateur" : 'Caméra indisponible sur cet appareil')
      }
    })()
    return () => { stopped = true; try { controls?.stop() } catch {} }
  }, [])
  return (
    <div className="scan-video">
      <video ref={videoRef} muted playsInline />
      <div className="scan-frame" aria-hidden="true" />
      <div className="scan-hint">Vise le code-barres, un bip = article compté</div>
    </div>
  )
}

// ── Étiquettes code-barres à imprimer (code article interne, format Code 128) ──
export function LabelSheet({ items, onDone }) {
  const [svgs, setSvgs] = useState(null)
  useEffect(() => {
    if (!items?.length) { setSvgs(null); return }
    let cancelled = false
    ;(async () => {
      const JsBarcode = (await import('jsbarcode')).default
      const out = []
      for (const { product, qty } of items) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        JsBarcode(svg, product.sku, { format: 'CODE128', width: 1.6, height: 38, fontSize: 11, margin: 0, displayValue: true, font: 'monospace' })
        for (let i = 0; i < Math.min(qty, 200); i++) out.push({ key: `${product.id}-${i}`, name: product.name, price: product.price_cents, svg: svg.outerHTML })
      }
      if (cancelled) return
      setSvgs(out)
      document.body.classList.add('print-light')
      setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove('print-light'); setSvgs(null); onDone() }, 500) }, 200)
    })()
    return () => { cancelled = true }
  }, [items])
  if (!svgs) return null
  return createPortal(
    <div className="print-only"><div className="labels">
      <style>{`@page { margin: 8mm; } .labels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; color: #111; font-family: Arial, sans-serif; }
        .label { border: 1px dashed #bbb; border-radius: 2mm; padding: 2.5mm 3mm; break-inside: avoid; height: 30mm; display: flex; flex-direction: column; justify-content: space-between; }
        .label b { font-size: 8.5pt; line-height: 1.15; } .label svg { width: 100%; height: auto; max-height: 17mm; } .label span { font-size: 8pt; }`}</style>
      {svgs.map(l => <div key={l.key} className="label"><b>{l.name}</b><div dangerouslySetInnerHTML={{ __html: l.svg }} /><span>{euros(l.price)}</span></div>)}
    </div></div>,
    document.body,
  )
}
