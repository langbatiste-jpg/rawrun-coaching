# RAWRUN Coaching — mise en ligne de la V7

Cette version ajoute : connexion coach sécurisée, clés secrètes côté serveur, plans IA,
alertes coach, export PDF, appli installable sur téléphone et nouveau design.

Compte 20 à 30 minutes, une seule fois. Fais les étapes **dans l'ordre**.

---

## 1. Révoquer les anciennes clés (elles étaient visibles sur GitHub)

1. **Resend** → resend.com → *API Keys* → supprime l'ancienne clé → *Create API Key* → copie la nouvelle (garde-la de côté).
2. **Strava** → strava.com/settings/api → *Client Secret* → **Regenerate** → copie le nouveau secret.
3. **GitHub** → ton repo `rawrun-coaching` → *Settings* → tout en bas *Change visibility* → **Private**.

## 2. Mettre à jour la base Supabase

1. Supabase → ton projet → **SQL Editor** → *New query*.
2. Ouvre le fichier `supabase/migration_v7.sql`, copie tout, colle, clique **Run**.
   - Ligne 11 : l'email coach est `langbat57@gmail.com`. Si tu veux te connecter avec un autre email, change-le **avant** de lancer.
   - Tu dois voir *Success*. Tes données (athlètes, séances, planning) ne sont pas touchées.

## 3. Créer ton compte coach

1. Supabase → **Authentication** → **Users** → *Add user* → *Create new user*.
2. Email : le même que dans le SQL (ex. `langbat57@gmail.com`), mot de passe de ton choix, coche **Auto Confirm User**.
3. Supabase → **Authentication** → **Sign In / Providers** → désactive **Allow new users to sign up**
   (seul toi dois pouvoir créer un compte coach).

> Le code `RAWRUN` ne marche plus. Sur le site : bouton discret **···** en bas à droite → email + mot de passe.

## 4. Récupérer les clés dont le serveur a besoin

| Clé | Où la trouver |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → *Project Settings* → *API Keys* → **service_role** (secret, ne jamais la partager) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → *API Keys* → *Create Key* (ajoute 5 à 10 € de crédit dans *Billing*) |
| `RESEND_API_KEY` | la nouvelle clé de l'étape 1 |
| `STRAVA_CLIENT_SECRET` | le nouveau secret de l'étape 1 |

## 5. Les ajouter sur Vercel

Vercel → projet `rawrun-coaching` → **Settings** → **Environment Variables**. Ajoute (Environnements : *Production*, *Preview*, *Development*) :

```
SUPABASE_SERVICE_ROLE_KEY = (clé service_role)
COACH_EMAIL               = langbat57@gmail.com
ANTHROPIC_API_KEY         = sk-ant-...
RESEND_API_KEY            = re_...
STRAVA_CLIENT_SECRET      = ...
CRON_SECRET               = une phrase longue au hasard (ex. tape n'importe quoi, 30 caractères)
```

`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` existent déjà : ne les touche pas.

## 6. Déployer

Pousse le code sur GitHub (ou fusionne la branche) : Vercel redéploie tout seul.
Si Vercel avait déjà déployé avant l'étape 5 : *Deployments* → les trois points du dernier → **Redeploy**.

## 7. Vérifier

- [ ] Connexion coach avec email + mot de passe → tu vois tes athlètes.
- [ ] *Plans IA* → *Nouveau plan* → *Générer la structure* : l'IA répond en ~30 s.
- [ ] Un athlète se connecte avec son code et voit sa semaine.
- [ ] Sur téléphone : *Plus* → *Installer l'appli*.

---

## Bon à savoir

- **Coût de l'IA** : de l'ordre de 1 € pour un plan complet de 16 semaines, quelques centimes pour une séance ou un bilan. Le suivi est sur console.anthropic.com.
- **Ta méthode** : dans *Nouveau plan* → *Voir / modifier ma méthode*. Elle est envoyée à l'IA à chaque demande.
- **E-mails aux athlètes** : avec l'adresse d'envoi par défaut de Resend (`onboarding@resend.dev`), Resend n'envoie qu'à ton propre email. Pour écrire aux athlètes, ajoute un domaine dans Resend (*Domains*) puis mets `RESEND_FROM = RAWRUN <coach@tondomaine.fr>` sur Vercel.
- **Rappels automatiques** : chaque jour à 18 h, les athlètes qui ont un e-mail reçoivent leur séance du lendemain.
- **Tester en local** : `npm run dev` suffit pour l'interface, mais les fonctions serveur (`/api`) ne tournent qu'avec `npx vercel dev`.

## Ce qui reste perfectible

Les athlètes se connectent encore avec un code simple : quelqu'un qui devine le code d'un athlète peut voir son planning.
Prochaine étape conseillée : passer les athlètes sur de vrais comptes (email + lien magique).
