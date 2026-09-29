import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { FG } from './ui'
import { DEFAULT_METHOD, DEFAULT_RULES } from '../../shared/method.js'
import { enforceStructure, stepsToBlocks, athleteZones } from '../../shared/training.js'
import SessionBar from './SessionBar'

// Page « Ma méthode » : ce que l'IA applique à chaque plan et chaque séance
export default function MethodPage({ showToast }) {
  const [email, setEmail] = useState(null)
  const [method, setMethod] = useState(DEFAULT_METHOD)
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [saved, setSaved] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const e = data?.user?.email; setEmail(e)
      if (!e) return
      const { data: row } = await supabase.from('coaches').select('method,rules').ilike('email', e).maybeSingle()
      if (row?.method) setMethod(row.method)
      if (row?.rules) setRules({ ...DEFAULT_RULES, ...row.rules })
    })
  }, [])

  const set = (k, v) => { setRules(r => ({ ...r, [k]: v })); setSaved(false) }
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('coaches').update({ method, rules }).ilike('email', email)
    setBusy(false)
    if (error) return showToast(error.message.includes('column') ? 'Lance la migration SQL à jour (colonnes method/rules)' : error.message, 'err')
    setSaved(true); showToast("Méthode enregistrée : l'IA l'applique dès maintenant ✓")
  }

  // Aperçu : une séance seuil « oubliée » par l'IA, corrigée par tes règles
  const demo = enforceStructure(stepsToBlocks([{ type: 'repeat', reps: 2, steps: [{ type: 'step', zone: 8, duration_s: 720 }, { type: 'step', zone: 1, duration_s: 180 }] }]), 'SEUIL', rules)
  const zones = athleteZones({ records: [{ distance: '10km', time: '38:00' }] })

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Ma méthode</div>
          <div className="page-sub">L'IA programme avec tes règles et ta façon de travailler, pour chaque plan et chaque séance.</div>
        </div>
        <button className="btn-primary" onClick={save} disabled={busy || saved}>{busy ? '…' : saved ? 'Enregistré' : 'Enregistrer'}</button>
      </div>

      <div className="method-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16, alignItems: 'start' }}>
        <style>{`@media (max-width: 960px) { .method-grid { grid-template-columns: 1fr !important; } }`}</style>
        <div className="card">
          <b>Philosophie et séances types</b>
          <div className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Écris comme tu parles à un athlète. Tout ce qui est ici est lu par l'IA avant chaque programmation.</div>
          <textarea className="input" value={method} onChange={e => { setMethod(e.target.value); setSaved(false) }} rows={28} style={{ fontSize: 13.5, lineHeight: 1.6 }} />
          <button className="btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { if (confirm('Revenir au texte de départ ?')) { setMethod(DEFAULT_METHOD); setSaved(false) } }}>Revenir au texte de départ</button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <b>Règles appliquées automatiquement</b>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 14px' }}>Même si l'IA oublie, la séance est corrigée avant d'arriver dans le planning.</div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <FG label="Échauffement EF (min)"><input className="input num" type="number" min={0} max={60} value={rules.warmup_min} onChange={e => set('warmup_min', Number(e.target.value))} /></FG>
              <FG label="Retour au calme (min)"><input className="input num" type="number" min={0} max={30} value={rules.cooldown_min} onChange={e => set('cooldown_min', Number(e.target.value))} /></FG>
            </div>
            <div className="grid-3" style={{ marginBottom: 12 }}>
              <FG label="Semaines de charge"><input className="input num" type="number" min={1} max={6} value={rules.block_load_weeks} onChange={e => set('block_load_weeks', Number(e.target.value))} /></FG>
              <FG label="Assimilation"><input className="input num" type="number" min={0} max={2} value={rules.block_recovery_weeks} onChange={e => set('block_recovery_weeks', Number(e.target.value))} /></FG>
              <FG label="Volume (%)"><input className="input num" type="number" min={40} max={100} value={rules.recovery_volume_pct} onChange={e => set('recovery_volume_pct', Number(e.target.value))} /></FG>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label className="check"><input type="checkbox" checked={rules.ef_no_pace} onChange={e => set('ef_no_pace', e.target.checked)} /> EF sans allure : « aux sensations »</label>
              <label className="check"><input type="checkbox" checked={rules.long_run_nutrition} onChange={e => set('long_run_nutrition', e.target.checked)} /> Consigne nutrition sur les sorties longues</label>
              <label className="check"><input type="checkbox" checked={rules.hr_strap} onChange={e => set('hr_strap', e.target.checked)} /> Ceinture cardio sur seuil, spécifique et longue</label>
            </div>
          </div>

          <div className="card">
            <b>Aperçu</b>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Un seuil 2 × 12' proposé sans échauffement devient :</div>
            <SessionBar blocks={demo} />
            <div style={{ display: 'grid', gap: 4, marginTop: 12, fontSize: 13 }}>
              {demo.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{b.isLoop ? `${b.loopReps} × (12' Z8 + 3' Z1)` : b.name}</span>
                  <span className="num muted">{b.isLoop ? zones[7].paceMax + '–' + zones[7].paceMin : `${b.duration}'`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
