import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Overlay, FG } from './ui'
import { api } from '../api'
import { euros } from './Shop'
import { suggestSku } from '../lib/compta'
import DeliverySlips, { printSlips } from './DeliverySlips'

const toCents = v => Math.round(Number(String(v).replace(',', '.')) * 100) || 0
const fromCents = c => (Number(c || 0) / 100).toString().replace('.', ',')

export default function ShopAdmin({ showToast }) {
  const [tab, setTab] = useState('offers')
  const [offers, setOffers] = useState([])
  const [options, setOptions] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [edit, setEdit] = useState(null) // { table, row }
  const [slips, setSlips] = useState(null)
  const [shipping, setShipping] = useState(null) // commande en cours d'expédition

  const load = async () => {
    const [o, op, p, or] = await Promise.all([
      supabase.from('offers').select('*').order('sort'),
      supabase.from('offer_options').select('*').order('sort'),
      supabase.from('products').select('*').order('sort'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    if (o.error) showToast('Lance supabase/migration_v9_boutique.sql pour activer la boutique', 'err')
    setOffers(o.data || []); setOptions(op.data || []); setProducts(p.data || []); setOrders(or.data || [])
  }
  useEffect(() => { load() }, [])

  const toggle = async (table, row) => {
    await supabase.from(table).update({ active: !row.active }).eq('id', row.id)
    showToast(row.active ? 'Retiré du site' : 'En vente sur le site ✓'); load()
  }
  const remove = async (table, row) => {
    if (!confirm(`Supprimer « ${row.name} » ?`)) return
    await supabase.from(table).delete().eq('id', row.id); load()
  }
  const setStatus = async (o, status, extra = {}) => { await supabase.from('orders').update({ status, ...extra }).eq('id', o.id); load() }

  const subs = orders.filter(o => o.kind === 'coaching' && o.status === 'active')
  const mrr = subs.reduce((s, o) => s + (o.items || []).filter(i => i.interval === 'month').reduce((a, i) => a + (i.price_cents || 0), 0), 0)
  const toShip = orders.filter(o => o.kind === 'shop' && o.status === 'paid')
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
  const sales = orders.filter(o => new Date(o.created_at) >= month).reduce((s, o) => s + (o.amount_cents || 0), 0)

  return (
    <div className="view-enter">
      <div className="page-head">
        <div><div className="page-title">Boutique</div><div className="page-sub">Tes offres de coaching, tes produits et tes commandes. Paiements par Stripe.</div></div>
        <button className="btn-primary" onClick={() => setEdit({ table: tab === 'products' ? 'products' : tab === 'options' ? 'offer_options' : 'offers', row: null })} style={{ display: tab === 'orders' ? 'none' : undefined }}>+ Ajouter</button>
      </div>

      <div className="stats-grid">
        <div className="card"><div className="stat-val">{subs.length}</div><div className="stat-label">abonnés actifs</div></div>
        <div className="card"><div className="stat-val">{euros(mrr)}</div><div className="stat-label">revenu mensuel récurrent</div></div>
        <div className="card"><div className="stat-val">{euros(sales)}</div><div className="stat-label">encaissé ce mois-ci</div></div>
        <div className="card"><div className="stat-val">{toShip.length}</div><div className="stat-label">commande{toShip.length > 1 ? 's' : ''} à expédier</div></div>
      </div>

      {toShip.length > 0 && (
        <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, borderColor: 'rgba(255,90,31,.45)' }}>
          <span style={{ fontSize: 22 }}>📦</span>
          <div style={{ flex: 1, minWidth: 200 }}><b>{toShip.length} colis à préparer</b><div className="muted" style={{ fontSize: 13 }}>Imprime les bons : liste des articles à cocher + étiquette d'adresse à découper.</div></div>
          <button className="btn-primary" onClick={() => printSlips(setSlips, toShip)}>{toShip.length > 1 ? `Imprimer les ${toShip.length} bons de livraison` : 'Imprimer le bon de livraison'}</button>
        </div>
      )}

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {[['offers', 'Offres coaching'], ['options', 'Options'], ['products', 'Produits'], ['orders', `Commandes${toShip.length ? ` (${toShip.length})` : ''}`]].map(([k, l]) => <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab !== 'orders' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {(tab === 'offers' ? offers : tab === 'options' ? options : products).map(r => {
            const table = tab === 'offers' ? 'offers' : tab === 'options' ? 'offer_options' : 'products'
            return (
              <div key={r.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {table === 'products' && <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-4)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.image_url ? <img src={r.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📦'}</div>}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600 }}>{r.name} {r.highlight && <span className="pill" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>mise en avant</span>}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {r.sku ? `${r.sku} · ` : ''}{euros(r.price_cents)}{r.interval === 'month' ? ' / mois' : r.interval === 'once' ? ' une fois' : ''}
                    {r.calls_per_week ? ` · ${r.calls_per_week} min d'appel/sem.` : ''}{table === 'products' ? ` · ${r.category || '—'} · stock ${r.stock ?? 'illimité'}` : ''}
                  </div>
                </div>
                <button className={`chip ${r.active ? 'on' : ''}`} onClick={() => toggle(table, r)}>{r.active ? 'En vente' : 'Masqué'}</button>
                <button className="btn-ghost btn-sm" onClick={() => setEdit({ table, row: r })}>Modifier</button>
                <button className="icon-btn" aria-label="Supprimer" onClick={() => remove(table, r)}>×</button>
              </div>
            )
          })}
          {tab === 'products' && !products.length && <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>Ajoute tes premiers produits : gels, ceintures, chaussettes… Ils apparaissent sur le site dès que tu les passes « En vente ».</div>}
        </div>
      )}

      {tab === 'orders' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {!orders.length && <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>Les paiements validés arrivent ici automatiquement.</div>}
          {orders.map(o => (
            <div key={o.id} className="card" style={{ borderLeft: `3px solid ${o.status === 'paid' ? 'var(--accent)' : o.status === 'active' ? 'var(--lime)' : 'var(--border-2)'}` }}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.kind === 'shop' ? '🛒' : '🏃'} {o.order_no && <span className="num" style={{ color: 'var(--text-3)', fontWeight: 400 }}>{o.order_no} · </span>}{o.name || o.email} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
                  <div className="muted" style={{ fontSize: 13 }}>{(o.items || []).map(i => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(', ')}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{[o.email, o.phone].filter(Boolean).join(' · ')}</div>
                  {o.shipping?.address && <div style={{ fontSize: 12.5, marginTop: 4 }}>📦 {[o.shipping.name, o.shipping.address.line1, o.shipping.address.line2, `${o.shipping.address.postal_code || ''} ${o.shipping.address.city || ''}`].filter(Boolean).join(', ')}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 17 }}>{euros(o.amount_cents)}</div>
                  <div style={{ fontSize: 12.5, color: o.status === 'active' ? 'var(--lime)' : o.status === 'paid' ? 'var(--accent)' : 'var(--text-3)' }}>{{ paid: 'Payée — à expédier', shipped: 'Expédiée', active: 'Abonnement actif', canceled: 'Abonnement arrêté' }[o.status] || o.status}</div>
                  {o.access_code && <div style={{ fontSize: 12.5 }}>Code envoyé : <b className="num">{o.access_code}</b></div>}
                  {o.tracking && <div className="muted" style={{ fontSize: 12.5 }}>Suivi : {o.tracking}</div>}
                  {o.kind === 'shop' && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
                      <button className="btn-ghost btn-sm" onClick={() => printSlips(setSlips, [o])}>🖨 Bon de livraison</button>
                      {o.status === 'paid' && <button className="btn-primary btn-sm" onClick={() => setShipping(o)}>Marquer expédiée</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeliverySlips orders={slips} />
      {shipping && <ShipModal order={shipping} onClose={() => setShipping(null)} onDone={async tracking => { await setStatus(shipping, 'shipped', { shipped_at: new Date().toISOString(), tracking: tracking || null }); try { await api('notify-shipped', { order_id: shipping.id }, { coach: true }) } catch {} setShipping(null); showToast('Commande expédiée, le client est prévenu ✓') }} />}
      {edit && <EditModal {...edit} skus={products.map(p => p.sku).filter(s => s && s !== edit.row?.sku)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} showToast={showToast} />}
    </div>
  )
}

function EditModal({ table, row, onClose, onSaved, showToast, skus = [] }) {
  const isProduct = table === 'products', isOffer = table === 'offers'
  const [f, setF] = useState({
    name: row?.name || '', description: row?.description || '', price: fromCents(row?.price_cents || 0),
    interval: row?.interval || 'month', features: (row?.features || []).join('\n'), calls_per_week: row?.calls_per_week || 0,
    highlight: !!row?.highlight, active: row ? !!row.active : true, sort: row?.sort || 0,
    category: row?.category || 'Nutrition', image_url: row?.image_url || '', stock: row?.stock ?? '', sku: row?.sku || '', cost: fromCents(row?.cost_cents || 0), barcode: row?.barcode || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  const upload = async file => {
    if (!file) return
    setBusy(true)
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('boutique').upload(path, file, { upsert: false, contentType: file.type })
    setBusy(false)
    if (error) return showToast('Envoi de la photo impossible : ' + error.message, 'err')
    set('image_url', supabase.storage.from('boutique').getPublicUrl(path).data.publicUrl)
  }

  const save = async () => {
    if (!f.name.trim()) return showToast('Nom requis', 'err')
    const data = { name: f.name.trim(), description: f.description, price_cents: toCents(f.price), active: f.active, sort: Number(f.sort) || 0 }
    if (!isProduct) data.interval = f.interval
    if (isOffer) Object.assign(data, { features: f.features.split('\n').map(s => s.trim()).filter(Boolean), calls_per_week: Number(f.calls_per_week) || 0, highlight: f.highlight })
    if (isProduct) Object.assign(data, { category: f.category, image_url: f.image_url || null, stock: f.stock === '' ? null : Number(f.stock), sku: f.sku.trim().toUpperCase() || suggestSku(f.name, f.category, skus), cost_cents: toCents(f.cost) })
    if (isProduct && f.barcode.trim() !== (row?.barcode || '')) data.barcode = f.barcode.trim() || null // colonne ajoutée en v12
    setBusy(true)
    const { error } = row ? await supabase.from(table).update(data).eq('id', row.id) : await supabase.from(table).insert(data)
    setBusy(false)
    if (error) return showToast(error.message, 'err')
    showToast('Enregistré ✓'); onSaved()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">{row ? 'Modifier' : isProduct ? 'Nouveau produit' : isOffer ? 'Nouvelle offre' : 'Nouvelle option'}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <FG label="Nom"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} placeholder={isProduct ? 'Gel énergétique citron' : isOffer ? 'Coaching Premium' : 'Appel en plus'} /></FG>
        <FG label="Description"><textarea className="input" rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></FG>
        <div className="grid-2">
          <FG label="Prix (€)"><input className="input num" inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value)} /></FG>
          {isProduct
            ? <FG label="Stock (vide = illimité)"><input className="input num" type="number" min={0} value={f.stock} onChange={e => set('stock', e.target.value)} /></FG>
            : <FG label="Paiement"><select className="input" value={f.interval} onChange={e => set('interval', e.target.value)}><option value="month">Chaque mois</option><option value="once">Une seule fois</option></select></FG>}
        </div>
        {isOffer && <>
          <FG label="Temps d'appel inclus (minutes par semaine)"><input className="input num" type="number" min={0} step={15} value={f.calls_per_week} onChange={e => set('calls_per_week', e.target.value)} /></FG>
          <FG label="Ce qui est inclus (une ligne par point)"><textarea className="input" rows={4} value={f.features} onChange={e => set('features', e.target.value)} placeholder={'Plan ajusté chaque semaine\nChat avec ton coach'} /></FG>
          <label className="check"><input type="checkbox" checked={f.highlight} onChange={e => set('highlight', e.target.checked)} /> Mettre en avant (« Le plus choisi »)</label>
        </>}
        {isProduct && <>
          <div className="grid-2">
            <FG label="Code article"><div style={{ display: 'flex', gap: 6 }}><input className="input num" value={f.sku} onChange={e => set('sku', e.target.value.toUpperCase())} placeholder="auto" /><button className="btn-ghost btn-sm" type="button" onClick={() => set('sku', suggestSku(f.name, f.category, skus))}>Générer</button></div></FG>
            <FG label="Prix d'achat unitaire (€)"><input className="input num" inputMode="decimal" value={f.cost} onChange={e => set('cost', e.target.value)} /></FG>
          </div>
          <FG label="Code-barres fabricant (EAN, facultatif)"><input className="input num" value={f.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Scanne le code imprimé sur l'emballage" /></FG>
          {toCents(f.price) > 0 && toCents(f.cost) > 0 && <div className="muted" style={{ fontSize: 13 }}>Marge : {euros(toCents(f.price) - toCents(f.cost))} par article ({Math.round((toCents(f.price) - toCents(f.cost)) / toCents(f.price) * 100)} %)</div>}
          <FG label="Catégorie"><input className="input" list="cats" value={f.category} onChange={e => set('category', e.target.value)} /><datalist id="cats"><option>Nutrition</option><option>Accessoires</option><option>Textile</option><option>Récupération</option></datalist></FG>
          <FG label="Photo">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {f.image_url && <img src={f.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }} />}
              <label className="btn-ghost btn-sm" style={{ cursor: 'pointer' }}>{f.image_url ? 'Changer' : 'Ajouter une photo'}<input type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} /></label>
              {f.image_url && <button className="icon-btn" onClick={() => set('image_url', '')}>×</button>}
            </div>
          </FG>
        </>}
        <div className="grid-2">
          <label className="check"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> En vente sur le site</label>
          <FG label="Ordre d'affichage"><input className="input num" type="number" value={f.sort} onChange={e => set('sort', e.target.value)} /></FG>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

function ShipModal({ order, onClose, onDone }) {
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">Colis expédié</div>
      <p className="muted" style={{ marginBottom: 14 }}>{order.order_no} · {order.name}. Le client reçoit un e-mail « ton colis est parti ».</p>
      <FG label="Numéro de suivi (facultatif)"><input className="input num" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="6A12345678901 (La Poste / Colissimo)" autoFocus /></FG>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onDone(tracking.trim()) }}>{busy ? '…' : 'Confirmer l\'expédition'}</button>
      </div>
    </Overlay>
  )
}
