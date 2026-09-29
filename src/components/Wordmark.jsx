import { BRAND } from '../../shared/brand.js'
export default function Wordmark({ className = 'rr-nav-logo', style }) {
  return <div className={className} style={style}>{BRAND.name}<span>{BRAND.accent}</span></div>
}
