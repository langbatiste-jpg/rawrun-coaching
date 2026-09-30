import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { Overlay, FG } from './ui'
import * as C from '../lib/compta'

const { euros, toCents } = C
const REV = '#3a8ee6', EXP = '#e8521c' // couleurs validées (lisibles aussi pour les daltoniens)
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const startOfYear = () => `${new Date().getFullYear()}-01-01`
const startOfMonth = () => C.today().slice(0, 8) + '01'

// Dépenses auxquelles penser (non ajoutées tant que tu ne les confirmes pas)
const SUGGESTIONS = [
  { label: 'Nom de domaine (ex. lang-coaching.fr)', category: 'Nom de domaine & hébergement', amount: '10', frequency: 'year', note: 'Nécessaire pour que les e-mails arrivent chez tes clients' },
  { label: 'Emballages (enveloppes, cartons)', category: 'Emballages', amount: '', once: true },
  { label: "Frais d'envoi (Colissimo, lettre suivie)", category: "Frais d'expédition", amount: '', once: true },
  { label: 'Stock de départ (gels, accessoires)', category: 'Achats de marchandises', stock: true },
  { label: 'Compte bancaire pro', category: 'Frais bancaires', amount: '', frequency: 'month', note: 'Obligatoire au-delà de 10 000 € de CA 2 années de suite' },
  { label: 'Cotisations URSSAF', category: 'Cotisations URSSAF', amount: '', once: true, note: 'Déclaration mensuelle ou trimestrielle' },
]

export default function ComptaPage({ showToast }) {
  const [tab, setTab] = useState('dash')
  const [d, setD] = useState({ entries: [], recurring: [], orders: [], movements: [], products: [], settings: {} })
  const [ready, setReady] = useState(false)
  const [period, setPeriod] = useState({ key: 'year', from: startOfYear(), to: C.today() })
  const [modal, setModal] = useState(null)

  const load = async () => {
    const [e, r, o, m, p, s] = await Promise.all([
      supabase.from('compta_entries').select('*').order('date', { ascending: false }),
      supabase.from('compta_recurring').select('*').order('created_at'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('stock_movements').select('*').order('date', { ascending: false }),
      supabase.from('products').select('*').order('sort'),
      supabase.from('compta_settings').select('*').maybeSingle(),
    ])
    if (e.error) showToast('Lance supabase/migration_v11_compta.sql pour activer la compta', 'err')
    setD({ entries: e.data || [], recurring: r.data || [], orders: o.data || [], movements: m.data || [], products: p.data || [], settings: s.data || {} })
    setReady(true)
  }
  useEffect(() => { load() }, [])

  const setPeriodKey = key => {
    const y = new Date().getFullYear()
    const map = { month: [startOfMonth(), C.today()], year: [startOfYear(), C.today()], last: [`${y - 1}-01-01`, `${y - 1}-12-31`], all: ['2000-01-01', C.today()] }
    setPeriod(p => key === 'custom' ? { ...p, key } : { key, from: map[key][0], to: map[key][1] })
  }

  const is = useMemo(() => C.incomeStatement(d, period.from, period.to), [d, period])
  const diff = useMemo(() => C.differentialStatement(d, period.from, period.to), [d, period])
  const bs = useMemo(() => C.balanceSheet(d, period.to), [d, period])

  const TABS = [['dash', 'Tableau de bord'], ['journal', 'Journal'], ['stock', 'Stock & inventaire'], ['clients', 'Clients'], ['result', 'Compte de résultat'], ['diff', 'Différentiel'], ['bilan', 'Bilan'], ['settings', 'Réglages']]

  return (
    <div className="view-enter compta">
      <style>{CSS}</style>
      <div className="page-head">
        <div><div className="page-title">Compta</div><div className="page-sub">Recettes, dépenses, stock et résultats. Les ventes du site arrivent toutes seules.</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => setModal({ type: 'entry', kind: 'depense' })}>− Dépense</button>
          <button className="btn-primary" onClick={() => setModal({ type: 'entry', kind: 'recette' })}>+ Recette</button>
        </div>
      </div>

      <div className="compta-bar">
        <div className="tab-bar compta-tabs">{TABS.map(([k, l]) => <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
        {!['stock', 'clients', 'settings'].includes(tab) && (
          <div className="compta-period">
            <select className="input" value={period.key} onChange={e => setPeriodKey(e.target.value)} aria-label="Période">
              <option value="month">Ce mois-ci</option><option value="year">Cette année</option><option value="last">Année dernière</option><option value="all">Depuis le début</option><option value="custom">Personnalisée…</option>
            </select>
            {period.key === 'custom' && <>
              <input className="input" type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} aria-label="Du" />
              <input className="input" type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} aria-label="Au" />
            </>}
          </div>
        )}
      </div>

      {!ready ? <div className="muted">Chargement…</div> : <>
        {tab === 'dash' && <Dashboard d={d} is={is} diff={diff} bs={bs} period={period} onAdd={s => setModal({ type: 'suggest', s })} />}
        {tab === 'journal' && <Journal d={d} period={period} onEdit={e => setModal({ type: 'entry', entry: e, kind: e.kind })} onRecurring={r => setModal({ type: 'recurring', r })} reload={load} showToast={showToast} />}
        {tab === 'stock' && <Stock d={d} reload={load} showToast={showToast} openModal={setModal} />}
        {tab === 'clients' && <Clients d={d} />}
        {tab === 'result' && <IncomeStatement is={is} period={period} />}
        {tab === 'diff' && <Differential diff={diff} period={period} />}
        {tab === 'bilan' && <Balance bs={bs} />}
        {tab === 'settings' && <Settings d={d} reload={load} showToast={showToast} />}
      </>}

      {modal?.type === 'entry' && <EntryModal {...modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
      {modal?.type === 'recurring' && <RecurringModal r={modal.r} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
      {modal?.type === 'suggest' && (modal.s.stock
        ? <StockModal mode="achat" products={d.products} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />
        : modal.s.once
          ? <EntryModal kind="depense" entry={{ category: modal.s.category, label: modal.s.label.replace(/ \(.*\)/, ''), note: modal.s.note }} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />
          : <RecurringModal r={{ label: modal.s.label.replace(/ \(.*\)/, ''), category: modal.s.category, amount_cents: toCents(modal.s.amount), frequency: modal.s.frequency, start_date: C.today() }} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />)}
      {modal?.type === 'stock' && <StockModal {...modal} products={d.products} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} showToast={showToast} />}
    </div>
  )
}

// ─────────── TABLEAU DE BORD ───────────
function Dashboard({ d, is, diff, bs, period, onAdd }) {
  const months = useMemo(() => {
    const all = C.allEntries(d, period.to).filter(e => e.date >= period.from && e.date <= period.to)
    const map = {}
    for (const e of all) {
      const k = e.date.slice(0, 7)
      const m = map[k] ||= { k, rev: 0, exp: 0 }
      if (e.kind === 'recette') m.rev += e.amount_cents
      if (e.kind === 'depense') m.exp += e.amount_cents
    }
    return Object.values(map).sort((a, b) => a.k.localeCompare(b.k)).slice(-12)
  }, [d, period])
  const recurringMonthly = d.recurring.filter(r => r.active !== false && (!r.end_date || r.end_date >= C.today())).reduce((s, r) => s + (r.frequency === 'year' ? r.amount_cents / 12 : r.amount_cents), 0)
  const existing = new Set([...d.recurring.map(r => r.category), ...d.entries.map(e => e.category)])
  const todo = SUGGESTIONS.filter(s => !existing.has(s.category) || s.stock && !d.movements.some(m => m.type === 'achat' || m.type === 'initial'))

  return (
    <>
      <div className="stats-grid">
        <Kpi v={euros(is.revenue)} l="Chiffre d'affaires" />
        <Kpi v={euros(is.charges)} l="Charges" />
        <Kpi v={euros(is.result)} l={is.result >= 0 ? 'Bénéfice' : 'Perte'} tone={is.result >= 0 ? 'good' : 'bad'} />
        <Kpi v={euros(bs.cash)} l="Trésorerie estimée" />
      </div>

      <div className="compta-grid">
        <div className="card">
          <div className="compta-card-head"><b>Recettes et dépenses par mois</b>
            <div className="legend"><span><i style={{ background: REV }} />Recettes</span><span><i style={{ background: EXP }} />Dépenses</span></div>
          </div>
          <MonthChart months={months} />
        </div>
        <div className="card">
          <b>Seuil de rentabilité</b>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 14px' }}>Le chiffre d'affaires à atteindre pour couvrir toutes tes charges fixes.</p>
          {diff.breakEven === null ? <p className="muted">Pas encore de ventes sur la période.</p> : <>
            <div className="num" style={{ fontSize: 26 }}>{euros(diff.breakEven)}</div>
            <div className="progress" style={{ margin: '10px 0 6px' }} role="progressbar" aria-valuenow={Math.round(Math.min(1, is.revenue / (diff.breakEven || 1)) * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, is.revenue / (diff.breakEven || 1) * 100)}%` }} /></div>
            <div className="muted" style={{ fontSize: 13 }}>{is.revenue >= diff.breakEven ? `✓ Atteint : ${euros(diff.safetyMargin)} au-dessus` : `Encore ${euros(diff.breakEven - is.revenue)} de ventes`}</div>
          </>}
          <div className="compta-sep" />
          <div className="compta-row"><span>Charges fixes par mois</span><b className="num">{euros(recurringMonthly)}</b></div>
          <div className="compta-row"><span>Valeur du stock</span><b className="num">{euros(bs.stock)}</b></div>
          <div className="compta-row"><span>Cotisations URSSAF estimées</span><b className="num">{euros(is.urssafEstimate)}</b></div>
        </div>
      </div>

      {todo.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <b>Dépenses à penser</b>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Pas encore dans ta compta. Ajoute-les quand elles arrivent pour que ton résultat soit juste.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {todo.map(s => (
              <div key={s.label} className="compta-suggest">
                <div style={{ flex: 1, minWidth: 0 }}><div>{s.label}</div>{s.note && <div className="muted" style={{ fontSize: 12.5 }}>{s.note}</div>}</div>
                <button className="btn-ghost btn-sm" onClick={() => onAdd(s)}>Ajouter</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Kpi({ v, l, tone }) {
  return <div className="card"><div className="stat-val" style={{ fontSize: 34, color: tone === 'bad' ? 'var(--danger)' : undefined }}>{v}</div><div className="stat-label">{l}</div></div>
}

function MonthChart({ months }) {
  const [hover, setHover] = useState(null)
  if (!months.length) return <p className="muted" style={{ padding: '30px 0' }}>Aucune écriture sur la période.</p>
  const max = Math.max(1, ...months.map(m => Math.max(m.rev, m.exp)))
  const H = 160, W = 100 / months.length
  const label = k => new Date(k + '-15').toLocaleDateString('fr-FR', { month: 'short' })
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block', overflow: 'visible' }} role="img" aria-label="Recettes et dépenses par mois">
        <line x1="0" x2="100" y1={H - 0.5} y2={H - 0.5} stroke="rgba(255,255,255,.15)" vectorEffect="non-scaling-stroke" />
        {months.map((m, i) => {
          const bw = W * 0.3, x0 = i * W + W * 0.18
          const hr = m.rev / max * (H - 8), he = m.exp / max * (H - 8)
          return (
            <g key={m.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * W} y="0" width={W} height={H} fill={hover === i ? 'rgba(255,255,255,.04)' : 'transparent'} />
              <path d={bar(x0, H, bw, hr)} fill={REV} />
              <path d={bar(x0 + bw + W * 0.04, H, bw, he)} fill={EXP} />
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, marginTop: 6 }}>
        {months.map(m => <div key={m.k} className="muted" style={{ fontSize: 11.5, textAlign: 'center' }}>{label(m.k)}</div>)}
      </div>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${Math.min(80, Math.max(0, hover * W))}%` }}>
          <b>{new Date(months[hover].k + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>
          <div><i style={{ background: REV }} />Recettes <span className="num">{euros(months[hover].rev)}</span></div>
          <div><i style={{ background: EXP }} />Dépenses <span className="num">{euros(months[hover].exp)}</span></div>
          <div className="muted">Solde <span className="num">{euros(months[hover].rev - months[hover].exp)}</span></div>
        </div>
      )}
    </div>
  )
}
// Barre avec extrémité arrondie (4px) posée sur la ligne de base
function bar(x, H, w, h) {
  if (h <= 0) return ''
  const r = Math.min(1.2, w / 2, h)
  return `M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + w - r} Q${x + w},${H - h} ${x + w},${H - h + r} V${H} Z`
}

// ─────────── JOURNAL ───────────
function Journal({ d, period, onEdit, onRecurring, reload, showToast }) {
  const [filter, setFilter] = useState('all')
  const all = useMemo(() => C.allEntries(d, period.to).filter(e => e.date >= period.from && e.date <= period.to), [d, period])
  const list = all.filter(e => filter === 'all' || e.kind === filter)
  const exportCsv = kind => {
    const rows = all.filter(e => e.kind === kind).sort((a, b) => a.date.localeCompare(b.date))
    const cols = [['Date', r => r.date], ['Compte', r => C.accountOf(r.kind, r.category)], ['Catégorie', r => r.category], ['Libellé', r => r.label], [kind === 'recette' ? 'Client' : 'Fournisseur', r => r.supplier || ''], ['Mode de paiement', r => r.payment || ''], ['Montant (€)', r => (r.amount_cents / 100).toFixed(2).replace('.', ',')]]
    C.download(`${kind === 'recette' ? 'livre-des-recettes' : 'registre-des-achats'}_${period.from}_${period.to}.csv`, C.toCsv(rows, cols))
  }
  const remove = async e => { if (!confirm('Supprimer cette écriture ?')) return; await supabase.from('compta_entries').delete().eq('id', e.id); showToast('Écriture supprimée'); reload() }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="compta-card-head"><b>Dépenses récurrentes</b><button className="btn-ghost btn-sm" onClick={() => onRecurring(null)}>+ Ajouter</button></div>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {d.recurring.map(r => (
            <button key={r.id} className="compta-line" onClick={() => onRecurring(r)}>
              <span style={{ flex: 1 }}>{r.label} <span className="muted">· {r.category}</span></span>
              <span className="muted" style={{ fontSize: 12.5 }}>depuis le {fmtDate(r.start_date)}{r.end_date ? ` jusqu'au ${fmtDate(r.end_date)}` : ''}{r.active === false ? ' · en pause' : ''}</span>
              <b className="num">{euros(r.amount_cents)}/{r.frequency === 'year' ? 'an' : 'mois'}</b>
            </button>
          ))}
          {!d.recurring.length && <span className="muted">Aucune.</span>}
        </div>
      </div>

      <div className="compta-bar" style={{ marginBottom: 10 }}>
        <div className="chips">{[['all', 'Tout'], ['recette', 'Recettes'], ['depense', 'Dépenses'], ['apport', 'Apports']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost btn-sm" onClick={() => exportCsv('recette')}>⬇ Livre des recettes</button>
          <button className="btn-ghost btn-sm" onClick={() => exportCsv('depense')}>⬇ Registre des achats</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="compta-table">
          <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th className="r">Montant</th><th /></tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id}>
                <td className="nowrap">{fmtDate(e.date)}</td>
                <td>{e.label}{e.supplier && <div className="muted" style={{ fontSize: 12 }}>{e.supplier}</div>}</td>
                <td className="muted">{e.category}{e.auto && ' · auto'}{e.recurring && ' · récurrent'}</td>
                <td className="r num" style={{ color: e.kind === 'recette' || e.kind === 'apport' ? 'var(--text)' : 'var(--text-2)' }}>{e.kind === 'depense' || e.kind === 'retrait' ? '−' : '+'}{euros(e.amount_cents)}</td>
                <td className="r nowrap">{!e.auto && !e.recurring && <><button className="icon-btn" aria-label="Modifier" onClick={() => onEdit(e)}>✎</button><button className="icon-btn" aria-label="Supprimer" onClick={() => remove(e)}>×</button></>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 28 }}>Aucune écriture sur la période.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

function EntryModal({ kind: initialKind, entry, onClose, onSaved, showToast }) {
  const isEdit = !!entry?.id
  const [f, setF] = useState({ kind: entry?.kind || initialKind || 'depense', date: entry?.date || C.today(), category: entry?.category || '', label: entry?.label || '', amount: entry?.amount_cents ? (entry.amount_cents / 100).toString().replace('.', ',') : '', supplier: entry?.supplier || '', payment: entry?.payment || 'CB', note: entry?.note || '', variable: entry?.variable })
  const cats = C.CATEGORIES[f.kind] || []
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  useEffect(() => { if (!cats.some(c => c.name === f.category)) set('category', cats[0]?.name || '') }, [f.kind])
  const save = async () => {
    if (!f.label.trim() || !toCents(f.amount)) return showToast('Libellé et montant requis', 'err')
    const row = { kind: f.kind, date: f.date, category: f.category, label: f.label.trim(), amount_cents: toCents(f.amount), supplier: f.supplier || null, payment: f.payment, note: f.note || null, variable: f.kind === 'depense' ? (f.variable ?? C.isVariableCategory(f.category)) : false }
    const { error } = isEdit ? await supabase.from('compta_entries').update(row).eq('id', entry.id) : await supabase.from('compta_entries').insert(row)
    if (error) return showToast(error.message, 'err')
    showToast('Enregistré ✓'); onSaved()
  }
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">{isEdit ? "Modifier l'écriture" : 'Nouvelle écriture'}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="chips">{[['recette', 'Recette'], ['depense', 'Dépense'], ['apport', 'Apport perso'], ['retrait', 'Retrait perso']].map(([k, l]) => <button key={k} className={`chip ${f.kind === k ? 'on' : ''}`} onClick={() => set('kind', k)}>{l}</button>)}</div>
        <div className="grid-2">
          <FG label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Montant payé (€)"><input className="input num" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="18,00" autoFocus /></FG>
        </div>
        <FG label="Libellé"><input className="input" value={f.label} onChange={e => set('label', e.target.value)} placeholder={f.kind === 'depense' ? 'Colissimo commande LANG-2026-0003' : 'Séance individuelle'} /></FG>
        <div className="grid-2">
          <FG label="Catégorie"><select className="input" value={f.category} onChange={e => set('category', e.target.value)}>{cats.map(c => <option key={c.name}>{c.name}</option>)}</select></FG>
          <FG label={f.kind === 'recette' ? 'Client' : 'Fournisseur'}><input className="input" value={f.supplier} onChange={e => set('supplier', e.target.value)} /></FG>
        </div>
        <div className="grid-2">
          <FG label="Paiement"><select className="input" value={f.payment} onChange={e => set('payment', e.target.value)}>{['CB', 'Virement', 'Espèces', 'Prélèvement', 'Stripe', 'Chèque', 'PayPal'].map(p => <option key={p}>{p}</option>)}</select></FG>
          {f.kind === 'depense' && <FG label="Type de charge"><select className="input" value={(f.variable ?? C.isVariableCategory(f.category)) ? 'v' : 'f'} onChange={e => set('variable', e.target.value === 'v')}><option value="f">Fixe (tombe même sans vente)</option><option value="v">Variable (liée aux ventes)</option></select></FG>}
        </div>
        <FG label="Note"><input className="input" value={f.note} onChange={e => set('note', e.target.value)} /></FG>
        {f.category === 'Achats de marchandises' && !isEdit && <div className="muted" style={{ fontSize: 13 }}>Pour un achat de produits à revendre, passe plutôt par <b>Stock → Réception</b> : le stock et la compta sont mis à jour en même temps.</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></div>
      </div>
    </Overlay>
  )
}

function RecurringModal({ r, onClose, onSaved, showToast }) {
  const isEdit = !!r?.id
  const [f, setF] = useState({ label: r?.label || '', category: r?.category || 'Logiciels & abonnements', amount: r?.amount_cents ? (r.amount_cents / 100).toString().replace('.', ',') : '', frequency: r?.frequency || 'month', start_date: r?.start_date || C.today(), end_date: r?.end_date || '', supplier: r?.supplier || '', active: r?.active !== false })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.label.trim() || !toCents(f.amount)) return showToast('Libellé et montant requis', 'err')
    const row = { label: f.label.trim(), category: f.category, amount_cents: toCents(f.amount), frequency: f.frequency, start_date: f.start_date, end_date: f.end_date || null, supplier: f.supplier || null, active: f.active, variable: C.isVariableCategory(f.category) }
    const { error } = isEdit ? await supabase.from('compta_recurring').update(row).eq('id', r.id) : await supabase.from('compta_recurring').insert(row)
    if (error) return showToast(error.message, 'err')
    showToast('Enregistré ✓'); onSaved()
  }
  const remove = async () => { if (!confirm('Supprimer cette dépense récurrente et tout son historique ? (Pour l\'arrêter, mets plutôt une date de fin.)')) return; await supabase.from('compta_recurring').delete().eq('id', r.id); onSaved() }
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">{isEdit ? 'Dépense récurrente' : 'Nouvelle dépense récurrente'}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        <FG label="Libellé"><input className="input" value={f.label} onChange={e => set('label', e.target.value)} placeholder="Abonnement Claude" /></FG>
        <div className="grid-2">
          <FG label="Montant (€)"><input className="input num" inputMode="decimal" value={f.amount} onChange={e => set('amount', e.target.value)} /></FG>
          <FG label="Tous les"><select className="input" value={f.frequency} onChange={e => set('frequency', e.target.value)}><option value="month">mois</option><option value="year">ans</option></select></FG>
        </div>
        <FG label="Catégorie"><select className="input" value={f.category} onChange={e => set('category', e.target.value)}>{C.CATEGORIES.depense.map(c => <option key={c.name}>{c.name}</option>)}</select></FG>
        <div className="grid-2">
          <FG label="Premier prélèvement"><input className="input" type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></FG>
          <FG label="Fin (si arrêté)"><input className="input" type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} /></FG>
        </div>
        <FG label="Fournisseur"><input className="input" value={f.supplier} onChange={e => set('supplier', e.target.value)} /></FG>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          {isEdit ? <button className="btn-danger" onClick={remove}>Supprimer</button> : <span />}
          <div style={{ display: 'flex', gap: 10 }}><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></div>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────── STOCK & INVENTAIRE ───────────
function Stock({ d, reload, showToast, openModal }) {
  const [inv, setInv] = useState(null) // { [productId]: quantité comptée }
  const [busy, setBusy] = useState(false)
  const products = d.products
  const value = p => (p.stock || 0) * (p.cost_cents || 0)
  const total = products.reduce((s, p) => s + value(p), 0)
  const missingSku = products.filter(p => !p.sku)

  const genSkus = async () => {
    const taken = products.map(p => p.sku).filter(Boolean)
    for (const p of missingSku) { const sku = C.suggestSku(p.name, p.category, taken); taken.push(sku); await supabase.from('products').update({ sku }).eq('id', p.id) }
    showToast(`${missingSku.length} code${missingSku.length > 1 ? 's' : ''} article créé${missingSku.length > 1 ? 's' : ''} ✓`); reload()
  }
  const validateInventory = async () => {
    const changes = products.filter(p => inv[p.id] !== undefined && inv[p.id] !== '' && Number(inv[p.id]) !== (p.stock || 0))
    if (!changes.length) { setInv(null); return showToast('Aucun écart : stock conforme ✓') }
    if (!confirm(`${changes.length} écart(s) seront enregistrés et le stock du site corrigé. Continuer ?`)) return
    setBusy(true)
    for (const p of changes) {
      const counted = Math.max(0, Math.round(Number(inv[p.id])))
      await supabase.from('stock_movements').insert({ product_id: p.id, qty: counted - (p.stock || 0), type: 'inventaire', unit_cost_cents: p.cost_cents || 0, note: `Inventaire : ${p.stock || 0} théorique → ${counted} compté` })
      await supabase.from('products').update({ stock: counted }).eq('id', p.id)
    }
    setBusy(false); setInv(null); showToast('Inventaire enregistré ✓'); reload()
  }
  const exportCsv = () => C.download(`inventaire_${C.today()}.csv`, C.toCsv(products, [['Code article', p => p.sku || ''], ['Produit', p => p.name], ['Catégorie', p => p.category || ''], ['Stock', p => p.stock ?? ''], ['Prix d\'achat (€)', p => ((p.cost_cents || 0) / 100).toFixed(2).replace('.', ',')], ['Prix de vente (€)', p => ((p.price_cents || 0) / 100).toFixed(2).replace('.', ',')], ['Valeur du stock (€)', p => (value(p) / 100).toFixed(2).replace('.', ',')], ['Compté', () => '']]))

  return (
    <>
      <div className="stats-grid">
        <Kpi v={products.length} l="articles" />
        <Kpi v={products.reduce((s, p) => s + (p.stock || 0), 0)} l="unités en stock" />
        <Kpi v={euros(total)} l="valeur du stock (prix d'achat)" />
        <Kpi v={products.filter(p => p.stock !== null && p.stock <= 3).length} l="articles bientôt épuisés" />
      </div>

      {missingSku.length > 0 && (
        <div className="card compta-suggest" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}><b>{missingSku.length} article{missingSku.length > 1 ? 's' : ''} sans code</b><div className="muted" style={{ fontSize: 13 }}>Un code unique par article (ex. NUT-GEL-001) : affiché sur le site et sur les bons de livraison.</div></div>
          <button className="btn-primary btn-sm" onClick={genSkus}>Créer les codes</button>
        </div>
      )}

      <div className="compta-bar" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary btn-sm" onClick={() => openModal({ type: 'stock', mode: 'achat' })}>+ Réception de marchandises</button>
          <button className="btn-ghost btn-sm" onClick={() => openModal({ type: 'stock', mode: 'initial' })}>Stock de départ</button>
          <button className="btn-ghost btn-sm" onClick={() => openModal({ type: 'stock', mode: 'perte' })}>Perte / casse</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost btn-sm" onClick={exportCsv}>⬇ Feuille d'inventaire</button>
          {inv ? <><button className="btn-ghost btn-sm" onClick={() => setInv(null)}>Annuler</button><button className="btn-lime btn-sm" disabled={busy} onClick={validateInventory}>Valider l'inventaire</button></>
            : <button className="btn-ghost btn-sm" onClick={() => setInv({})}>Faire un inventaire</button>}
        </div>
      </div>
      {inv && <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Compte tes articles et saisis les quantités réelles. Les écarts sont enregistrés et le stock du site est corrigé.</p>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="compta-table">
          <thead><tr><th>Code</th><th>Article</th><th className="r">Stock</th>{inv && <th className="r">Compté</th>}<th className="r">Prix d'achat</th><th className="r">Prix de vente</th><th className="r">Marge</th><th className="r">Valeur</th></tr></thead>
          <tbody>
            {products.map(p => {
              const margin = p.price_cents && p.cost_cents ? (p.price_cents - p.cost_cents) / p.price_cents : null
              const counted = inv?.[p.id]
              const gap = counted !== undefined && counted !== '' ? Number(counted) - (p.stock || 0) : null
              return (
                <tr key={p.id}>
                  <td className="num nowrap">{p.sku || <span className="muted">—</span>}</td>
                  <td>{p.name}<div className="muted" style={{ fontSize: 12 }}>{p.category}</div></td>
                  <td className="r num" style={{ color: p.stock !== null && p.stock <= 3 ? 'var(--gold)' : undefined }}>{p.stock ?? '∞'}</td>
                  {inv && <td className="r"><input className="input num" style={{ width: 74, padding: '6px 8px', textAlign: 'right' }} inputMode="numeric" value={counted ?? ''} onChange={e => setInv(x => ({ ...x, [p.id]: e.target.value }))} aria-label={`Quantité comptée ${p.name}`} />{gap ? <div style={{ fontSize: 11.5, color: gap < 0 ? 'var(--danger)' : 'var(--lime)' }}>{gap > 0 ? '+' : ''}{gap}</div> : null}</td>}
                  <td className="r num">{p.cost_cents ? euros(p.cost_cents) : <span className="muted">à saisir</span>}</td>
                  <td className="r num">{euros(p.price_cents)}</td>
                  <td className="r num">{margin === null ? '—' : `${Math.round(margin * 100)} %`}</td>
                  <td className="r num">{euros(value(p))}</td>
                </tr>
              )
            })}
            {!products.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 28 }}>Ajoute tes produits dans Boutique → Produits.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">Derniers mouvements</div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="compta-table">
          <thead><tr><th>Date</th><th>Article</th><th>Type</th><th className="r">Quantité</th><th className="r">Coût unit.</th></tr></thead>
          <tbody>
            {d.movements.slice(0, 40).map(m => {
              const p = products.find(x => x.id === m.product_id)
              return <tr key={m.id}><td className="nowrap">{fmtDate(m.date)}</td><td>{p?.name || '?'}{m.note && <div className="muted" style={{ fontSize: 12 }}>{m.note}</div>}</td><td>{{ achat: 'Réception', vente: 'Vente', inventaire: 'Inventaire', perte: 'Perte', initial: 'Stock de départ' }[m.type]}</td><td className="r num">{m.qty > 0 ? '+' : ''}{m.qty}</td><td className="r num">{euros(m.unit_cost_cents)}</td></tr>
            })}
            {!d.movements.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 22 }}>Aucun mouvement.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

function StockModal({ mode, products, onClose, onSaved, showToast }) {
  const [f, setF] = useState({ product_id: products[0]?.id || '', qty: '', unit: '', total: '', supplier: '', date: C.today(), payment: 'CB' })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const p = products.find(x => x.id === f.product_id)
  const unitCents = f.unit ? toCents(f.unit) : f.total && Number(f.qty) ? Math.round(toCents(f.total) / Number(f.qty)) : (p?.cost_cents || 0)
  const titles = { achat: 'Réception de marchandises', initial: 'Stock de départ', perte: 'Perte / casse' }
  const save = async () => {
    const qty = Math.round(Number(f.qty))
    if (!p || !qty || qty < 0) return showToast('Choisis un article et une quantité', 'err')
    const cur = p.stock || 0
    const signed = mode === 'perte' ? -Math.min(qty, cur) : qty
    let cost = p.cost_cents || 0
    if (mode !== 'perte') cost = cur + qty > 0 ? Math.round((cur * (p.cost_cents || 0) + qty * unitCents) / (cur + qty)) : unitCents // coût moyen pondéré
    const { error } = await supabase.from('stock_movements').insert({ date: f.date, product_id: p.id, qty: signed, type: mode, unit_cost_cents: mode === 'perte' ? (p.cost_cents || 0) : unitCents, note: f.supplier ? `Fournisseur : ${f.supplier}` : null })
    if (error) return showToast(error.message, 'err')
    await supabase.from('products').update({ stock: Math.max(0, cur + signed), cost_cents: cost }).eq('id', p.id)
    if (mode === 'achat') await supabase.from('compta_entries').insert({ date: f.date, kind: 'depense', category: 'Achats de marchandises', label: `${qty} × ${p.name}`, amount_cents: unitCents * qty, supplier: f.supplier || null, payment: f.payment, product_id: p.id, qty, variable: true })
    showToast(mode === 'achat' ? 'Stock et dépense enregistrés ✓' : 'Stock mis à jour ✓'); onSaved()
  }
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">{titles[mode]}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {mode === 'initial' && <p className="muted" style={{ fontSize: 13 }}>Pour les articles que tu avais déjà avant d'utiliser la compta. Compté comme un apport, pas comme une dépense.</p>}
        <FG label="Article"><select className="input" value={f.product_id} onChange={e => set('product_id', e.target.value)}>{products.map(x => <option key={x.id} value={x.id}>{x.sku ? `${x.sku} · ` : ''}{x.name} (stock {x.stock ?? 0})</option>)}</select></FG>
        <div className="grid-2">
          <FG label="Quantité"><input className="input num" inputMode="numeric" value={f.qty} onChange={e => set('qty', e.target.value)} autoFocus /></FG>
          <FG label="Date"><input className="input" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></FG>
        </div>
        {mode !== 'perte' && <>
          <div className="grid-2">
            <FG label="Prix d'achat unitaire (€)"><input className="input num" inputMode="decimal" value={f.unit} onChange={e => set('unit', e.target.value)} placeholder={p?.cost_cents ? (p.cost_cents / 100).toString().replace('.', ',') : '1,50'} /></FG>
            <FG label="…ou montant total de la facture (€)"><input className="input num" inputMode="decimal" value={f.total} onChange={e => set('total', e.target.value)} disabled={!!f.unit} /></FG>
          </div>
          {mode === 'achat' && <div className="grid-2">
            <FG label="Fournisseur"><input className="input" value={f.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Decathlon Pro, Maurten…" /></FG>
            <FG label="Paiement"><select className="input" value={f.payment} onChange={e => set('payment', e.target.value)}>{['CB', 'Virement', 'Espèces', 'PayPal'].map(x => <option key={x}>{x}</option>)}</select></FG>
          </div>}
          {Number(f.qty) > 0 && unitCents > 0 && <div className="muted" style={{ fontSize: 13 }}>{f.qty} × {euros(unitCents)} = <b style={{ color: 'var(--text)' }}>{euros(unitCents * Number(f.qty))}</b>{p?.price_cents ? ` · marge ${Math.round((p.price_cents - unitCents) / p.price_cents * 100)} % au prix de vente actuel` : ''}</div>}
        </>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={onClose}>Annuler</button><button className="btn-primary" onClick={save}>Enregistrer</button></div>
      </div>
    </Overlay>
  )
}

// ─────────── CLIENTS ───────────
function Clients({ d }) {
  const [q, setQ] = useState('')
  const clients = useMemo(() => C.clientsFrom(d.orders), [d.orders])
  const list = clients.filter(c => !q || `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
  const exportCsv = () => C.download(`clients_${C.today()}.csv`, C.toCsv(clients, [['Nom', c => c.name || ''], ['E-mail', c => c.email || ''], ['Téléphone', c => c.phone || ''], ['Statut', c => c.subscription || 'Boutique'], ['Commandes', c => c.orders], ['Total (€)', c => (c.total / 100).toFixed(2).replace('.', ',')], ['Première commande', c => String(c.first).slice(0, 10)], ['Dernière commande', c => String(c.last).slice(0, 10)], ['Ville', c => c.address?.city || '']]))
  return (
    <>
      <div className="stats-grid">
        <Kpi v={clients.length} l="clients" />
        <Kpi v={clients.filter(c => c.subscription === 'Abonné').length} l="abonnés actifs" />
        <Kpi v={euros(clients.length ? clients.reduce((s, c) => s + c.total, 0) / clients.length : 0)} l="panier moyen par client" />
        <Kpi v={clients.filter(c => c.orders > 1).length} l="clients revenus" />
      </div>
      <div className="compta-bar" style={{ marginBottom: 10 }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Rechercher un client…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-ghost btn-sm" onClick={exportCsv}>⬇ Exporter</button>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="compta-table">
          <thead><tr><th>Client</th><th>Statut</th><th className="r">Commandes</th><th className="r">Total</th><th>Dernière</th></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.key}>
                <td>{c.name || c.email}<div className="muted" style={{ fontSize: 12 }}>{[c.email, c.phone, c.address?.city].filter(Boolean).join(' · ')}</div></td>
                <td><span className="pill" style={{ background: c.subscription === 'Abonné' ? 'var(--lime-glow)' : 'rgba(255,255,255,.05)', color: c.subscription === 'Abonné' ? 'var(--lime)' : 'var(--text-2)' }}>{c.subscription || 'Boutique'}</span></td>
                <td className="r num">{c.orders}</td>
                <td className="r num">{euros(c.total)}</td>
                <td className="nowrap">{fmtDate(String(c.last).slice(0, 10))}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 28 }}>Tes clients apparaissent ici dès le premier achat sur le site.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─────────── COMPTE DE RÉSULTAT ───────────
const Row = ({ label, v, sub, strong, neg, acc }) => (
  <div className={`fs-row ${strong ? 'strong' : ''} ${sub ? 'sub' : ''}`}>
    <span>{acc && <span className="fs-acc">{acc}</span>}{label}</span>
    <span className="num">{neg && v ? '−' : ''}{euros(Math.abs(v))}</span>
  </div>
)
const periodLabel = p => `du ${fmtDate(p.from)} au ${fmtDate(p.to)}`

function IncomeStatement({ is, period }) {
  return (
    <div className="fs-wrap">
      <div className="card fs">
        <div className="fs-title">Compte de résultat <span className="muted">{periodLabel(period)}</span></div>
        <div className="fs-section">Produits d'exploitation</div>
        <Row acc="706" label="Prestations de coaching" v={is.services} sub />
        <Row acc="707" label="Ventes de marchandises" v={is.sales} sub />
        {is.otherIncome > 0 && <Row acc="758" label="Autres produits" v={is.otherIncome} sub />}
        <Row label="Chiffre d'affaires" v={is.revenue} strong />
        <div className="fs-section">Charges d'exploitation</div>
        <Row acc="607" label="Achats de marchandises" v={is.purchases} sub />
        <Row acc="6037" label={`Variation de stock (${euros(is.stockStart)} → ${euros(is.stockEnd)})`} v={is.stockVariation} sub neg={is.stockVariation < 0} />
        {is.external.map(([c, v]) => <Row key={c} acc={C.accountOf('depense', c)} label={c} v={v} sub />)}
        {is.social > 0 && <Row acc="646" label="Cotisations URSSAF" v={is.social} sub />}
        <Row label="Total des charges" v={is.charges} strong />
        <div className={`fs-result ${is.result >= 0 ? 'pos' : 'neg'}`}><span>{is.result >= 0 ? 'Bénéfice' : 'Perte'}</span><span className="num">{euros(is.result)}</span></div>
      </div>
      <div className="card fs-side">
        <b>À retenir</b>
        <div className="compta-row"><span>Marge commerciale</span><b className="num">{euros(is.grossMarginGoods)}</b></div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Ventes de marchandises − coût d'achat des articles vendus ({euros(is.cogs)}).</div>
        <div className="compta-row"><span>Cotisations URSSAF estimées</span><b className="num">{euros(is.urssafEstimate)}</b></div>
        <div className="muted" style={{ fontSize: 12.5 }}>Calculées sur ton chiffre d'affaires avec les taux de l'onglet Réglages. En micro-entreprise, c'est sur le CA (pas sur le bénéfice) que tu paies : à vérifier sur autoentrepreneur.urssaf.fr.</div>
      </div>
    </div>
  )
}

function Differential({ diff, period }) {
  const pct = v => `${(v * 100).toFixed(1).replace('.', ',')} %`
  return (
    <div className="fs-wrap">
      <div className="card fs">
        <div className="fs-title">Compte de résultat différentiel <span className="muted">{periodLabel(period)}</span></div>
        <Row label="Chiffre d'affaires" v={diff.revenue} strong />
        <div className="fs-section">Charges variables (augmentent avec les ventes)</div>
        <Row label="Coût d'achat des marchandises vendues" v={diff.cogs} sub />
        {diff.varByCat.map(([c, v]) => <Row key={c} label={c} v={v} sub />)}
        <Row label="Total charges variables" v={diff.variableCosts} strong />
        <div className="fs-result pos" style={{ marginTop: 6 }}><span>Marge sur coût variable</span><span className="num">{euros(diff.margin)} · {pct(diff.marginRate)}</span></div>
        <div className="fs-section">Charges fixes (tombent même sans vente)</div>
        {diff.fixedByCat.map(([c, v]) => <Row key={c} label={c} v={v} sub />)}
        <Row label="Total charges fixes" v={diff.fixedCosts} strong />
        <div className={`fs-result ${diff.result >= 0 ? 'pos' : 'neg'}`}><span>Résultat</span><span className="num">{euros(diff.result)}</span></div>
      </div>
      <div className="card fs-side">
        <b>Seuil de rentabilité</b>
        <div className="num" style={{ fontSize: 28, margin: '6px 0' }}>{diff.breakEven === null ? '—' : euros(diff.breakEven)}</div>
        <div className="muted" style={{ fontSize: 13 }}>= charges fixes ÷ taux de marge sur coût variable ({euros(diff.fixedCosts)} ÷ {pct(diff.marginRate)})</div>
        <div className="compta-sep" />
        <div className="compta-row"><span>Point mort</span><b className="num">{diff.breakEvenDays === null ? '—' : diff.breakEvenDays > diff.days ? 'non atteint' : `jour ${diff.breakEvenDays} / ${diff.days}`}</b></div>
        <div className="compta-row"><span>Marge de sécurité</span><b className="num">{diff.safetyMargin === null ? '—' : euros(diff.safetyMargin)}</b></div>
        <div className="compta-row"><span>Indice de sécurité</span><b className="num">{diff.safetyMargin === null || !diff.revenue ? '—' : pct(diff.safetyMargin / diff.revenue)}</b></div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Chaque euro vendu au-dessus du seuil rapporte {diff.marginRate ? `${Math.round(diff.marginRate * 100)} centimes` : '—'} de bénéfice.</div>
      </div>
    </div>
  )
}

function Balance({ bs }) {
  return (
    <>
      <div className="fs-title" style={{ marginBottom: 12 }}>Bilan simplifié <span className="muted">au {fmtDate(bs.at)}</span></div>
      <div className="fs-wrap">
        <div className="card fs">
          <div className="fs-section" style={{ marginTop: 0 }}>Actif (ce que tu possèdes)</div>
          <Row acc="37" label="Stocks de marchandises" v={bs.stock} sub />
          <Row acc="512" label="Trésorerie (banque, Stripe)" v={bs.cash} sub neg={bs.cash < 0} />
          <Row label="Total actif" v={bs.totalAssets} strong />
        </div>
        <div className="card fs">
          <div className="fs-section" style={{ marginTop: 0 }}>Passif (d'où ça vient)</div>
          <Row acc="101" label="Capital de départ & apports" v={bs.opening + bs.apports + bs.initialStock} sub />
          {bs.retraits > 0 && <Row acc="108" label="Retraits personnels" v={bs.retraits} sub neg />}
          <Row acc="12" label={bs.result >= 0 ? 'Résultat (bénéfice cumulé)' : 'Résultat (perte cumulée)'} v={bs.result} sub neg={bs.result < 0} />
          <Row label="Total passif" v={bs.totalLiabilities} strong />
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{bs.balanced ? '✓ Bilan équilibré.' : '⚠ Écart entre actif et passif : vérifie la trésorerie de départ dans Réglages.'} La trésorerie est calculée à partir de tes écritures : compare-la avec ton relevé bancaire. En micro-entreprise, le bilan n'est pas obligatoire ; il sert à piloter.</p>
    </>
  )
}

// ─────────── RÉGLAGES ───────────
function Settings({ d, reload, showToast }) {
  const s = d.settings
  const [f, setF] = useState({ company_name: s.company_name || 'LANG Coaching', siret: s.siret || '', vat_regime: s.vat_regime || 'franchise', urssaf_services_pct: s.urssaf_services_pct ?? 21.2, urssaf_sales_pct: s.urssaf_sales_pct ?? 12.3, stripe_pct: s.stripe_pct ?? 1.5, stripe_fixed: ((s.stripe_fixed_cents ?? 25) / 100).toString().replace('.', ','), opening_cash: ((s.opening_cash_cents || 0) / 100).toString().replace('.', ',') })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    const { error } = await supabase.from('compta_settings').upsert({ id: 1, company_name: f.company_name, siret: f.siret || null, vat_regime: f.vat_regime, urssaf_services_pct: Number(String(f.urssaf_services_pct).replace(',', '.')), urssaf_sales_pct: Number(String(f.urssaf_sales_pct).replace(',', '.')), stripe_pct: Number(String(f.stripe_pct).replace(',', '.')), stripe_fixed_cents: toCents(f.stripe_fixed), opening_cash_cents: toCents(f.opening_cash) })
    if (error) return showToast(error.message, 'err')
    showToast('Réglages enregistrés ✓'); reload()
  }
  return (
    <div className="card" style={{ maxWidth: 620, display: 'grid', gap: 12 }}>
      <div className="grid-2">
        <FG label="Nom de l'activité"><input className="input" value={f.company_name} onChange={e => set('company_name', e.target.value)} /></FG>
        <FG label="SIRET"><input className="input num" value={f.siret} onChange={e => set('siret', e.target.value)} placeholder="à venir" /></FG>
      </div>
      <FG label="TVA"><select className="input" value={f.vat_regime} onChange={e => set('vat_regime', e.target.value)}><option value="franchise">Franchise en base (pas de TVA facturée)</option><option value="reel">Assujetti à la TVA</option></select></FG>
      <div className="grid-2">
        <FG label="Cotisations sur prestations (%)"><input className="input num" value={f.urssaf_services_pct} onChange={e => set('urssaf_services_pct', e.target.value)} /></FG>
        <FG label="Cotisations sur ventes (%)"><input className="input num" value={f.urssaf_sales_pct} onChange={e => set('urssaf_sales_pct', e.target.value)} /></FG>
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>Taux indicatifs de micro-entreprise : vérifie ceux qui s'appliquent à ton activité sur autoentrepreneur.urssaf.fr.</div>
      <div className="grid-2">
        <FG label="Frais Stripe (%)"><input className="input num" value={f.stripe_pct} onChange={e => set('stripe_pct', e.target.value)} /></FG>
        <FG label="+ fixe par paiement (€)"><input className="input num" value={f.stripe_fixed} onChange={e => set('stripe_fixed', e.target.value)} /></FG>
      </div>
      <FG label="Trésorerie de départ (€)"><input className="input num" value={f.opening_cash} onChange={e => set('opening_cash', e.target.value)} /></FG>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn-primary" onClick={save}>Enregistrer</button></div>
    </div>
  )
}

const CSS = `
.compta-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
.compta-tabs { max-width: 100%; overflow-x: auto; }
.compta-tabs .tab-btn { white-space: nowrap; }
.compta-period { display: flex; gap: 8px; }
.compta-period .input { width: auto; padding: 8px 32px 8px 12px; font-size: 13px; }
.compta-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; }
.compta-card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--text-2); }
.legend i, .chart-tip i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.chart-tip { position: absolute; top: 0; min-width: 180px; background: #1b1b21; border: 1px solid var(--border-2); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; display: grid; gap: 4px; pointer-events: none; box-shadow: 0 20px 40px -10px rgba(0,0,0,.8); }
.chart-tip span { float: right; margin-left: 12px; }
.compta-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; font-size: 14px; }
.compta-sep { height: 1px; background: var(--border); margin: 14px 0 8px; }
.compta-suggest { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
.compta-line { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; text-align: left; background: rgba(0,0,0,.25); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text); cursor: pointer; font-size: 14px; }
.compta-line:hover { border-color: var(--border-2); }
.compta-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.compta-table th { text-align: left; font-weight: 500; color: var(--text-3); font-size: 12.5px; padding: 12px 14px; border-bottom: 1px solid var(--border-2); white-space: nowrap; }
.compta-table td { padding: 11px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.compta-table tr:last-child td { border-bottom: none; }
.compta-table .r { text-align: right; }
.nowrap { white-space: nowrap; }
.fs-wrap { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
.fs-title { font-family: var(--display); font-size: 30px; line-height: 1; margin-bottom: 14px; }
.fs-title .muted { font-family: var(--sans); font-size: 13px; margin-left: 8px; }
.fs-section { font-size: 12.5px; color: var(--text-3); margin: 16px 0 6px; }
.fs-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 14px; border-bottom: 1px solid var(--border); }
.fs-row.sub { padding-left: 4px; color: var(--text-2); }
.fs-row.strong { font-weight: 600; color: #fff; border-bottom-color: var(--border-2); }
.fs-acc { display: inline-block; width: 44px; color: var(--text-4); font-family: var(--mono); font-size: 12px; }
.fs-result { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 12px 14px; border-radius: 10px; font-weight: 600; font-size: 16px; }
.fs-result.pos { background: var(--lime-glow); color: var(--lime); }
.fs-result.neg { background: rgba(255,59,92,.12); color: var(--danger); }
@media (max-width: 960px) { .compta-grid, .fs-wrap { grid-template-columns: 1fr; } }
`
