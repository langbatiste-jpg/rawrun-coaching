// Méthode d'entraînement de Batiste Lang — injectée dans CHAQUE demande à l'IA.
// Deux parties :
//  1. DEFAULT_RULES : les règles chiffrées, appliquées automatiquement par le code
//     (même si l'IA les oublie, la séance est corrigée avant d'arriver dans le planning).
//  2. DEFAULT_METHOD : la philosophie et les séances types, en texte, modifiable
//     depuis la page « Ma méthode » de l'espace coach.

export const DEFAULT_RULES = {
  warmup_min: 30,          // échauffement en EF avant toute séance de qualité
  cooldown_min: 10,        // retour au calme après toute séance de qualité
  ef_no_pace: true,        // pas d'allure imposée en EF : aux sensations
  block_load_weeks: 3,     // semaines de charge…
  block_recovery_weeks: 1, // …puis semaine d'assimilation
  recovery_volume_pct: 70, // volume de la semaine d'assimilation (% de la précédente)
  long_run_nutrition: true,
  hr_strap: true,          // ceinture cardio sur seuil / spécifique / longue
}

export const DEFAULT_METHOD = `PHILOSOPHIE
- Système Smart Pace : 14 zones ancrées sur des allures de course (AS42 = marathon, AS21 = semi, AS10 = 10 km, AS5 = 5 km) et les seuils SV1/SV2, pas sur des % de VMA.
- Ne jamais répéter deux fois exactement le même stimulus : on fait varier les formats, les durées, les récupérations et les allures d'une semaine à l'autre.
- Travailler autour de l'allure spécifique de l'objectif : au-dessus, en dessous et à l'allure cible. Plus on approche de la course, plus c'est spécifique.
- Plus un bloc est long, plus l'allure est lente ; plus il est court, plus elle est rapide. On mélange les allures dans une même séance (allure semi, allure 10 km, allure 5 km…).
- Les séances doivent rester variées et « fun » : pyramides, fartleks structurés, côtes, relances, transferts côte → plat.

STRUCTURE D'UNE SÉANCE DE QUALITÉ (systématique, y compris le spécifique)
- Échauffement : 30 min en endurance fondamentale (+ gammes et 3-4 lignes droites si séance de vitesse).
- Corps de séance.
- Retour au calme : 10 min trot.

ENDURANCE FONDAMENTALE
- Jamais d'allure imposée en EF : l'athlète court aux sensations, selon comment il se sent (Z1-Z2 seulement comme repère).
- EF de récupération ≈ 1 h, vraiment relâchée, sur le plat.
- EF + activation structurée en fin de footing : ex. 8 × 45"/45" (45" vif allure 10 km / 45" footing), 6 × 200 m allure 10 km récup 200 m, 6 × 150 m en 50 m vite / 50 m actif / 50 m vite. Les parties « vite » peuvent aller plus vite que l'allure 10 km.

SÉANCES TYPES (exemples de mon style, à varier)
- Seuil : 30' EF + 2 × 12' à 2 × 14' en Z7-Z8 (récup 3') + 10' RAC. Ceinture cardio pour suivre la dérive.
- Côtes longues en seuil (préférées aux côtes courtes en bloc spécifique) : moins de casse musculaire, stimulus seuil + force.
- Côtes courtes + transfert : 6 × 1' en côte (4-6 %) puis 5 × 20"/20" sur le plat pour retranscrire la foulée.
- Pyramide / jeux de vitesse : 2' (r 1') / 4' (r 2') / 6' (r 3')… récup = moitié de l'effort ; blocs longs à allure semi, courts à allure 10 km ou 5 km. Variante : 2/3 du bloc à allure semi + 1/3 à allure 10 km.
- Endurance active (EA) : 30' EF puis blocs enchaînés SANS récupération, ex. 10' Z4 + 5' Z5 + 10' Z4 + 5' Z5.
- Progressif : 30' EF → 10' Z3 → 10' Z4 → 10' Z5 (AS42) → 10' RAC, enchaîné.
- Piste : ex. 5 × 1200 m en 400 allure semi / 400 allure 10 km / 400 allure semi (récup 2') + 3 × 100 m allure VMA.
- Fartlek : structuré avec des allures variées plutôt que 100 % au feeling.

SORTIE LONGUE
- 30' EF + bloc spécifique + EF + 10' RAC.
- Spécifique marathon : ex. [15' AS42 + 5' AS21] × 2 (40 min), puis [18' AS42 + 6' AS21] × 2 (48 min) : on progresse de semaine en semaine en alternant allures un peu plus vite et un peu plus lente que l'AS42.
- Nutrition : 50-60 g de glucides par heure (gels), toujours avec de l'eau, sur les sorties > 1h15.
- Ceinture cardio pour comparer la dérive cardiaque d'une semaine à l'autre.

PÉRIODISATION
- Blocs de 4 semaines : 3 semaines de charge progressive (« charbon ») + 1 semaine d'assimilation allégée.
- Semaine type en prépa marathon (4 séances) : S1 EF + activation, S2 qualité (seuil / côtes / pyramide / piste), S3 EF récup 1 h, S4 sortie longue avec spécifique.
- Un jour facile entre la séance de qualité et la sortie longue ; jamais deux séances dures d'affilée.
- Semaine de course : on allège nettement le volume, on garde un peu de rythme.

NOUVEAUX ATHLÈTES
- Avant d'avoir des allures : tout au ressenti (« vite mais je peux encore dire 3-4 mots »).
- Test de référence : 5 km contre-la-montre (ou 3 km pour un débutant) et/ou demi-Cooper (6 min).

CONSIGNES À L'ATHLÈTE
- Chaque séance explique l'intention du coach en 1-2 phrases, en tutoyant, avec des mots simples.`

// Texte des règles chiffrées, ajouté au prompt de l'IA
export function rulesText(r = DEFAULT_RULES) {
  return [
    `Toute séance de qualité commence par EXACTEMENT ${r.warmup_min} min d'échauffement en EF (zone 2) et finit par EXACTEMENT ${r.cooldown_min} min de retour au calme (zone 1).`,
    r.ef_no_pace ? "L'endurance fondamentale n'a jamais d'allure imposée : écris « aux sensations » dans les consignes EF." : '',
    `Périodisation en blocs : ${r.block_load_weeks} semaines de charge + ${r.block_recovery_weeks} semaine d'assimilation à ~${r.recovery_volume_pct} % du volume.`,
    r.long_run_nutrition ? 'Sortie longue > 1h15 : consigne nutrition 50-60 g de glucides/h avec de l\'eau.' : '',
    r.hr_strap ? 'Seuil, spécifique et sortie longue : rappeler la ceinture cardio pour la dérive cardiaque.' : '',
  ].filter(Boolean).join('\n')
}

// Types de séances considérés comme « qualité » (échauffement + RAC obligatoires)
export const QUALITY_TYPES = ['SEUIL', 'VMA', 'FARTLEK', 'COTES', 'PISTE', 'SORTIE', 'CROSS']
