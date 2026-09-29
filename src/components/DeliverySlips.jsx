import { createPortal } from 'react-dom'
import { BRAND } from '../../shared/brand.js'

const euros = c => (Number(c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

// Imprime un ou plusieurs bons de livraison (1 par page A4, fond blanc pour l'imprimante)
export function printSlips(setSlips, orders) {
  setSlips(orders)
  document.body.classList.add('print-light')
  setTimeout(() => {
    window.print()
    setTimeout(() => { setSlips(null); document.body.classList.remove('print-light') }, 500)
  }, 150)
}

export default function DeliverySlips({ orders }) {
  if (!orders?.length) return null
  return createPortal(
    <div className="print-only slips">
      <style>{`
        @page { margin: 0; }
        .slips { color: #111; font-family: 'Space Grotesk', Arial, sans-serif; font-size: 11pt; }
        .slip { page-break-after: always; break-after: page; padding: 14mm 14mm 10mm; }
        .slip:last-child { page-break-after: auto; break-after: auto; }
        .slip-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8pt; margin-bottom: 14pt; }
        .slip-logo { font-family: 'Bebas Neue', Impact, sans-serif; font-size: 34pt; line-height: .9; }
        .slip-logo span { color: #ff5a1f; }
        .slip h2 { font-family: 'Bebas Neue', Impact, sans-serif; font-size: 22pt; margin: 0; letter-spacing: .02em; }
        .slip-meta { text-align: right; font-size: 10pt; line-height: 1.5; }
        .slip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin-bottom: 16pt; }
        .slip-box { border: 1.5px solid #111; border-radius: 6pt; padding: 10pt 12pt; min-height: 70pt; }
        .slip-box.ship { border-width: 3px; font-size: 13pt; line-height: 1.45; }
        .slip-label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #555; margin-bottom: 4pt; }
        .slip table { width: 100%; border-collapse: collapse; margin-bottom: 14pt; }
        .slip th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #555; border-bottom: 1.5px solid #111; padding: 6pt 4pt; }
        .slip td { padding: 9pt 4pt; border-bottom: 1px solid #ccc; vertical-align: middle; }
        .slip .chk { width: 13pt; height: 13pt; border: 1.5px solid #111; border-radius: 2pt; display: inline-block; }
        .slip .qty { font-size: 14pt; font-weight: 700; text-align: center; width: 50pt; }
        .slip-foot { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt; margin-top: 18pt; font-size: 10pt; }
        .slip-line { border-bottom: 1px solid #111; height: 22pt; }
        .slip-cut { margin-top: 26pt; border-top: 1.5px dashed #999; padding-top: 12pt; }
        .slip-cut .slip-box.ship { font-size: 16pt; }
      `}</style>
      {orders.map(o => {
        const a = o.shipping?.address
        const count = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0)
        return (
          <div className="slip" key={o.id}>
            <div className="slip-head">
              <div><div className="slip-logo">{BRAND.name}<span>{BRAND.accent}</span></div><div style={{ fontSize: '9pt', color: '#555' }}>{BRAND.full} · {BRAND.coach}</div></div>
              <div className="slip-meta">
                <h2>Bon de livraison</h2>
                <div><b>{o.order_no || o.id.slice(0, 8).toUpperCase()}</b></div>
                <div>Commandé le {new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>

            <div className="slip-grid">
              <div className="slip-box ship">
                <div className="slip-label">{a ? 'Livrer à' : 'Remise en main propre'}</div>
                <b>{o.shipping?.name || o.name}</b><br />
                {a ? <>{a.line1}<br />{a.line2 && <>{a.line2}<br /></>}{a.postal_code} {a.city}<br />{a.country && a.country !== 'FR' ? a.country : 'France'}</> : <span>À remettre à l'entraînement</span>}
              </div>
              <div className="slip-box">
                <div className="slip-label">Client</div>
                {o.name}<br />{o.email}<br />{o.phone}
                <div className="slip-label" style={{ marginTop: '8pt' }}>Mode</div>
                {o.shipping?.method || (a ? 'Livraison à domicile' : 'Main propre')}
              </div>
            </div>

            <table>
              <thead><tr><th style={{ width: 24 }}>✓</th><th>Article</th><th style={{ textAlign: 'center' }}>Qté</th><th style={{ textAlign: 'right' }}>Prix unit.</th></tr></thead>
              <tbody>
                {(o.items || []).map((i, k) => (
                  <tr key={k}><td><span className="chk" /></td><td>{i.name}</td><td className="qty">{i.qty || 1}</td><td style={{ textAlign: 'right' }}>{euros(i.price_cents)}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{count} article{count > 1 ? 's' : ''} à mettre dans le colis</span>
              <span>Total payé : <b>{euros(o.amount_cents)}</b></span>
            </div>

            <div className="slip-foot">
              <div><div className="slip-label">Préparé le</div><div className="slip-line" /></div>
              <div><div className="slip-label">N° de suivi</div><div className="slip-line">{o.tracking || ''}</div></div>
              <div><div className="slip-label">Expédié le</div><div className="slip-line">{o.shipped_at ? new Date(o.shipped_at).toLocaleDateString('fr-FR') : ''}</div></div>
            </div>

            {a && (
              <div className="slip-cut">
                <div className="slip-label">✂ Étiquette à découper et coller sur le colis</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12pt' }}>
                  <div className="slip-box ship"><b>{o.shipping?.name || o.name}</b><br />{a.line1}<br />{a.line2 && <>{a.line2}<br /></>}{a.postal_code} {a.city}<br />{a.country && a.country !== 'FR' ? a.country : 'FRANCE'}</div>
                  <div className="slip-box" style={{ fontSize: '9.5pt' }}><div className="slip-label">Expéditeur</div>{BRAND.coach}<br />{BRAND.full}<br /><br />Réf. {o.order_no}</div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
