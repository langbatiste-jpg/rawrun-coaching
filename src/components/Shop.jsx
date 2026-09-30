import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { api } from '../api'

export const euros = c => (Number(c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 })

// ─────────── OFFRES DE COACHING ───────────
export function CoachingOffers({ showToast, header = null }) {
  const [offers, setOffers] = useState([])
  const [options, setOptions] = useState([])
  const [picked, setPicked] = useState(null)
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('offers').select('*').eq('active', true).order('sort'),
      supabase.from('offer_options').select('*').eq('active', true).order('sort'),
    ]).then(([o, op]) => { setOffers(o.data || []); setOptions(op.data || []) })
  }, [])

  const offer = offers.find(o => o.id === picked)
  const monthly = (offer?.interval === 'month' ? offer.price_cents : 0) + options.filter(o => chosen.includes(o.id) && o.interval === 'month').reduce((s, o) => s + o.price_cents, 0)
  const once = (offer?.interval === 'once' ? offer.price_cents : 0) + options.filter(o => chosen.includes(o.id) && o.interval === 'once').reduce((s, o) => s + o.price_cents, 0)

  const pay = async () => {
    setBusy(true)
    try { const { url } = await api('checkout', { kind: 'coaching', offer_id: picked, option_ids: chosen }); window.location.href = url }
    catch (e) { showToast ? showToast(e.message, 'err') : alert(e.message); setBusy(false) }
  }

  if (!offers.length) return null
  return (
    <div className="shop-offers">
      {header}
      <div className="offer-grid" style={{ '--n': Math.min(offers.length, 3) }}>
        {offers.map(o => (
          <button key={o.id} className={`offer-card ${o.highlight ? 'hl' : ''} ${picked === o.id ? 'on' : ''}`} onClick={() => setPicked(o.id)}>
            {o.highlight && <span className="offer-badge">Le plus choisi</span>}
            <div className="offer-name">{o.name}</div>
            <div className="offer-price"><span className="display">{euros(o.price_cents)}</span>{o.interval === 'month' ? <small>/mois</small> : <small> une fois</small>}</div>
            {o.description && <p className="offer-desc">{o.description}</p>}
            {o.calls_per_week > 0 && <div className="offer-call">📞 {o.calls_per_week} min d'appel par semaine</div>}
            <ul>{(o.features || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
            <span className={`offer-cta ${picked === o.id ? 'on' : ''}`}>{picked === o.id ? '✓ Choisie' : 'Choisir'}</span>
          </button>
        ))}
      </div>

      {offer && (
        <div className="offer-summary card">
          {options.length > 0 && (
            <>
              <b>Ajoute des options</b>
              <div className="offer-options">
                {options.map(o => (
                  <label key={o.id} className={`opt ${chosen.includes(o.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={chosen.includes(o.id)} onChange={e => setChosen(c => e.target.checked ? [...c, o.id] : c.filter(x => x !== o.id))} />
                    <span className="opt-body"><b>{o.name}</b>{o.description && <span className="muted">{o.description}</span>}</span>
                    <span className="num opt-price">+{euros(o.price_cents)}{o.interval === 'month' ? '/mois' : ''}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="offer-total">
            <div>
              {monthly > 0 && <div><span className="display" style={{ fontSize: 40 }}>{euros(monthly)}</span><span className="muted"> /mois</span></div>}
              {once > 0 && <div className="muted">{monthly > 0 ? '+ ' : ''}<b style={{ color: 'var(--text)', fontSize: monthly ? 15 : 34 }} className={monthly ? '' : 'display'}>{euros(once)}</b> {monthly ? 'à la première échéance' : 'en une fois'}</div>}
              {monthly > 0 && <div className="muted" style={{ fontSize: 12.5 }}>Sans engagement, résiliable à tout moment.</div>}
            </div>
            <button className="btn-primary" onClick={pay} disabled={busy}>{busy ? 'Redirection…' : monthly ? "S'abonner" : 'Payer'}</button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Paiement sécurisé par Stripe · carte, Apple Pay, Google Pay</div>
        </div>
      )}
    </div>
  )
}

// ─────────── BOUTIQUE ───────────
const CART_KEY = 'lang_cart'
const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] } }

export function Boutique({ showToast, header = null }) {
  const [products, setProducts] = useState([])
  const [cat, setCat] = useState('Tout')
  const [cart, setCart] = useState(loadCart)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { supabase.from('products').select('*').eq('active', true).order('sort').then(({ data }) => setProducts(data || [])) }, [])
  useEffect(() => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {} }, [cart])

  const cats = useMemo(() => ['Tout', ...new Set(products.map(p => p.category || 'Autres'))], [products])
  const list = products.filter(p => cat === 'Tout' || (p.category || 'Autres') === cat)
  const lines = cart.map(c => ({ ...c, p: products.find(p => p.id === c.id) })).filter(l => l.p)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const total = lines.reduce((s, l) => s + l.qty * l.p.price_cents, 0)
  const add = p => { setCart(c => c.some(x => x.id === p.id) ? c.map(x => x.id === p.id ? { ...x, qty: Math.min(x.qty + 1, p.stock ?? 20) } : x) : [...c, { id: p.id, qty: 1 }]); showToast?.(`${p.name} ajouté au panier`) }
  const setQty = (id, qty) => setCart(c => qty <= 0 ? c.filter(x => x.id !== id) : c.map(x => x.id === id ? { ...x, qty } : x))

  const pay = async () => {
    setBusy(true)
    try { const { url } = await api('checkout', { kind: 'shop', items: lines.map(l => ({ product_id: l.id, qty: l.qty })) }); window.location.href = url }
    catch (e) { showToast ? showToast(e.message, 'err') : alert(e.message); setBusy(false) }
  }

  if (!products.length) return null
  return (
    <div className="boutique">
      {header}
      {cats.length > 2 && <div className="chips" style={{ marginBottom: 18 }}>{cats.map(c => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>}
      <div className="product-grid">
        {list.map(p => {
          const out = p.stock !== null && p.stock <= 0
          return (
            <div key={p.id} className="product">
              <div className="product-img">{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <span>{/gel|nutri|boisson|barre/i.test(`${p.category} ${p.name}`) ? '⚡' : /text|chauss|tee|maillot/i.test(`${p.category} ${p.name}`) ? '👕' : '🏃'}</span>}</div>
              <div className="product-body">
                <div className="muted" style={{ fontSize: 12 }}>{p.category}{p.sku ? <span className="num"> · Réf. {p.sku}</span> : null}</div>
                <div className="product-name">{p.name}</div>
                {p.description && <div className="product-desc">{p.description}</div>}
                <div className="product-foot">
                  <span className="num" style={{ fontSize: 17 }}>{euros(p.price_cents)}</span>
                  <button className="btn-primary btn-sm" disabled={out} onClick={() => add(p)}>{out ? 'Épuisé' : 'Ajouter'}</button>
                </div>
                {p.stock !== null && p.stock > 0 && p.stock <= 5 && <div style={{ fontSize: 12, color: 'var(--gold)' }}>Plus que {p.stock} en stock</div>}
              </div>
            </div>
          )
        })}
      </div>

      {count > 0 && <button className="cart-fab" onClick={() => setOpen(true)} aria-label="Voir le panier">🛒 <b>{count}</b> · {euros(total)}</button>}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Panier</div>
            {!lines.length && <p className="muted">Ton panier est vide.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{l.p.name}</div><div className="muted num" style={{ fontSize: 12.5 }}>{euros(l.p.price_cents)}</div></div>
                  <div className="qty">
                    <button className="icon-btn" onClick={() => setQty(l.id, l.qty - 1)} aria-label="Moins">−</button>
                    <span className="num">{l.qty}</span>
                    <button className="icon-btn" onClick={() => setQty(l.id, Math.min(l.qty + 1, l.p.stock ?? 20))} aria-label="Plus">+</button>
                  </div>
                  <div className="num" style={{ width: 70, textAlign: 'right' }}>{euros(l.qty * l.p.price_cents)}</div>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <div><div className="display" style={{ fontSize: 34 }}>{euros(total)}</div><div className="muted" style={{ fontSize: 12 }}>Livraison ou remise en main propre au choix à l'étape suivante</div></div>
              <button className="btn-primary" onClick={pay} disabled={busy || !lines.length}>{busy ? 'Redirection…' : 'Commander'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bandeau après retour de Stripe
export function OrderBanner() {
  const params = new URLSearchParams(window.location.search)
  const [state, setState] = useState(params.get('commande'))
  const [type] = useState(params.get('type'))
  useEffect(() => { if (state) window.history.replaceState({}, '', window.location.pathname + window.location.hash) }, [])
  if (!state) return null
  const ok = state === 'ok'
  return (
    <div className="order-banner" role="status" style={{ borderColor: ok ? 'var(--lime)' : 'var(--border-2)' }}>
      <span style={{ fontSize: 22 }}>{ok ? '🎉' : '↩︎'}</span>
      <div style={{ flex: 1 }}>
        <b>{ok ? (type === 'coaching' ? 'Bienvenue dans l\'équipe !' : 'Commande confirmée !') : 'Paiement annulé'}</b>
        <div className="muted" style={{ fontSize: 13 }}>{ok ? (type === 'coaching' ? 'Tu vas recevoir un e-mail de confirmation. Ton coach te contacte sous 48 h pour ton bilan de départ.' : 'Tu reçois le reçu par e-mail. On te prévient dès que c\'est expédié.') : 'Aucun montant n\'a été débité.'}</div>
      </div>
      <button className="icon-btn" onClick={() => setState(null)} aria-label="Fermer">×</button>
    </div>
  )
}
