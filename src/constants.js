export const BASE_ZONES = [
  { id:1,  name:"Endurance Fondamentale Basse",  short:"EFB",  color:"#9ca3af", refFactor:1.55 },
  { id:2,  name:"Endurance Fondamentale Haute",  short:"EFH",  color:"#6b7280", refFactor:1.43 },
  { id:3,  name:"Endurance Active Basse",         short:"EAB",  color:"#22d3ee", refFactor:1.32 },
  { id:4,  name:"Endurance Active Haute (SV1)",   short:"EAH",  color:"#3b82f6", refFactor:1.25 },
  { id:5,  name:"Tempo Bas (SV1→AS42)",           short:"TB",   color:"#4ade80", refFactor:1.18 },
  { id:6,  name:"Tempo Haut (AS42→AS21)",         short:"TH",   color:"#16a34a", refFactor:1.12 },
  { id:7,  name:"Seuil Bas (>AS21)",              short:"SB",   color:"#fde047", refFactor:1.07 },
  { id:8,  name:"Seuil Haut (SV2→AS10)",          short:"SH",   color:"#f97316", refFactor:1.02 },
  { id:9,  name:"VMA Longue (AS10→AS5)",          short:"VL",   color:"#fb923c", refFactor:0.97 },
  { id:10, name:"VMA Moyenne (AS5→AS3)",          short:"VM",   color:"#f43f5e", refFactor:0.93 },
  { id:11, name:"VMA Courte (>AS3)",              short:"VC",   color:"#ef4444", refFactor:0.88 },
  { id:12, name:"Allures Spécifiques 1500m",      short:"1500", color:"#dc2626", refFactor:0.83 },
  { id:13, name:"Allures Spécifiques 800m",       short:"800",  color:"#b91c1c", refFactor:0.80 },
  { id:14, name:"Allures Spécifiques Élevées",    short:"SPÉ",  color:"#7f1d1d", refFactor:0.75 },
]

export const SESSION_TYPES = [
  { id:"EF",     label:"Endurance Fondamentale", color:"#6b7280" },
  { id:"SEUIL",  label:"Seuil / Tempo",           color:"#fde047" },
  { id:"VMA",    label:"VMA / Intervalles",        color:"#f43f5e" },
  { id:"COTES",  label:"Côtes / PPG",              color:"#f97316" },
  { id:"SORTIE", label:"Sortie Longue",            color:"#818cf8" },
  { id:"RECUP",  label:"Récupération",             color:"#94a3b8" },
  { id:"REPOS",  label:"Repos",                    color:"#1e293b" },
  { id:"COMP",   label:"Compétition",              color:"#fbbf24" },
]

export const DAYS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"]

export const RPE_LABELS = ["","Très facile","Facile","Modéré","Modéré+","Difficile","Difficile+","Dur","Très dur","Extrême","Max"]
export const RPE_COLORS = ["","#4ade80","#86efac","#fde047","#fb923c","#f97316","#ef4444","#dc2626","#b91c1c","#991b1b","#7f1d1d"]
