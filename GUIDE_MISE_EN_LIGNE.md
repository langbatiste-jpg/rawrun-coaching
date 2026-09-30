# LANG Coaching — mise en ligne de la V8

Cette version ajoute : le nouveau nom (LANG), une page d'accueil animée au défilement, ta méthode
intégrée à l'IA (page « Ma méthode »), la connexion coach sécurisée, les clés secrètes côté serveur,
les plans IA, les alertes coach, l'export PDF et l'appli installable sur téléphone.

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

## 8. Boutique et abonnements (quand tu veux vendre)

1. Supabase → **SQL Editor** → colle `supabase/migration_v9_boutique.sql` → **Run**.
2. Crée un compte sur **stripe.com** (il te faudra ton statut d'auto-entrepreneur / SIRET pour encaisser en vrai).
   Reste d'abord en **mode test** : tu peux payer avec la carte `4242 4242 4242 4242`.
3. Stripe → *Développeurs* → *Clés API* → copie la **clé secrète** → Vercel : `STRIPE_SECRET_KEY`.
4. Stripe → *Développeurs* → *Webhooks* → *Ajouter un endpoint* :
   - URL : `https://rawrun-coaching.vercel.app/api/stripe-webhook`
   - Événements : `checkout.session.completed` et `customer.subscription.deleted`
   - Copie la **clé de signature** (`whsec_…`) → Vercel : `STRIPE_WEBHOOK_SECRET`. Redéploie.
5. Dans ton espace coach → **Boutique** : modifie les offres d'exemple (prix, contenu, minutes d'appel), ajoute tes produits avec photo, puis passe-les **« En vente »**. Rien n'apparaît sur le site tant que ce n'est pas en vente.
6. Pour que tes abonnés puissent résilier seuls : Stripe → *Paramètres* → *Portail client* → active le lien de connexion, et colle-le dans la description de tes offres.

7. Lance aussi `supabase/migration_v10_commandes.sql` (numéros de commande, codes d'accès, suivi d'expédition).

**Ce qui se passe tout seul après un paiement :**
- **Coaching** : le client reçoit par e-mail son **code d'accès** (ex. `HUGO4827`), son profil est créé dans *Athlètes*, et tu reçois une notification.
- **Boutique** : le client reçoit une confirmation avec son numéro de commande (`LANG-2026-0001`), le stock baisse, et un **bon de livraison** est prêt dans *Boutique → Commandes* (liste à cocher + étiquette d'adresse à découper). Quand tu cliques *Marquer expédiée* (avec ou sans numéro de suivi), le client reçoit « ton colis est parti ».

⚠️ **Pour que les e-mails arrivent chez tes clients**, il faut un nom de domaine vérifié dans Resend (ex. `lang-coaching.fr`, ~10 €/an). Sans domaine, Resend n'envoie qu'à ta propre adresse. Resend → *Domains* → *Add domain*, suis les instructions, puis mets sur Vercel `RESEND_FROM = LANG Coaching <coach@ton-domaine.fr>`.

Chaque paiement t'envoie un e-mail et arrive dans *Boutique → Commandes* (adresse de livraison comprise). Stripe prend environ 1,5 % + 0,25 € par paiement en Europe.

## 9. Compta

Lance `supabase/migration_v11_compta.sql` dans Supabase (SQL Editor → Run). Ton abonnement Claude (18 €/mois depuis septembre 2026) et le crédit IA de 5 € y sont déjà enregistrés.

Onglet **Compta** de l'espace coach :
- **Journal** : recettes, dépenses, apports ; dépenses récurrentes ; export du *livre des recettes* et du *registre des achats* (obligatoires en micro-entreprise).
- **Stock & inventaire** : codes articles (affichés sur le site et les bons de livraison), réception de marchandises (met à jour le stock ET la compta), pertes, inventaire avec écarts.
- **Clients**, **Compte de résultat**, **Différentiel** (marge sur coût variable, seuil de rentabilité, point mort), **Bilan**.
- Les ventes Stripe, leurs frais estimés et les sorties de stock arrivent tout seuls. Pour les renouvellements d'abonnement, ajoute l'événement `invoice.paid` à ton webhook Stripe.

## Bon à savoir

- **Changer le nom** : tout est dans `shared/brand.js` (une ligne à modifier). Pour une adresse à ton nom, renomme le projet dans Vercel (*Settings → General → Project Name*, ex. `lang-coaching`) puis mets le nouveau domaine dans les réglages de ton appli Strava (*Authorization Callback Domain*).
- **Ta méthode** : onglet *Ma méthode* dans l'espace coach. Les règles chiffrées (30′ d'échauffement, 10′ de retour au calme, EF sans allure, blocs 3+1) sont appliquées automatiquement à tout ce que l'IA produit ; le texte (philosophie, séances types) est lu par l'IA avant chaque programmation.

- **Coût de l'IA** : de l'ordre de 1 € pour un plan complet de 16 semaines, quelques centimes pour une séance ou un bilan. Le suivi est sur console.anthropic.com.
- **E-mails aux athlètes** : avec l'adresse d'envoi par défaut de Resend (`onboarding@resend.dev`), Resend n'envoie qu'à ton propre email. Pour écrire aux athlètes, ajoute un domaine dans Resend (*Domains*) puis mets `RESEND_FROM = RAWRUN <coach@tondomaine.fr>` sur Vercel.
- **Rappels automatiques** : chaque jour à 18 h, les athlètes qui ont un e-mail reçoivent leur séance du lendemain.
- **Tester en local** : `npm run dev` suffit pour l'interface, mais les fonctions serveur (`/api`) ne tournent qu'avec `npx vercel dev`.

## Ce qui reste perfectible

Les athlètes se connectent encore avec un code simple : quelqu'un qui devine le code d'un athlète peut voir son planning.
Prochaine étape conseillée : passer les athlètes sur de vrais comptes (email + lien magique).
