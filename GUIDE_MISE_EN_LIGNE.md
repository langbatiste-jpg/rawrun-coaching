# 🚀 RAWRUN COACHING — GUIDE DE MISE EN LIGNE
## De zéro au site publié en ~30 minutes

---

## ÉTAPE 1 — Prépare ton ordi (5 min)

### Installe Node.js
1. Va sur **https://nodejs.org**
2. Télécharge la version **LTS** (bouton vert)
3. Lance l'installateur, clique "Next" partout
4. Redémarre ton terminal après installation

### Vérifie que c'est bon
Ouvre le Terminal (Mac : Cmd+Espace → "Terminal") et tape :
```
node --version
```
Tu dois voir quelque chose comme `v20.x.x`. Si oui, c'est bon.

---

## ÉTAPE 2 — Crée ta base de données Supabase (10 min)

### 2.1 Crée un compte
1. Va sur **https://supabase.com**
2. Clique "Start your project" → crée un compte (gratuit)
3. Clique "New project"
4. Remplis :
   - **Name** : `rawrun-coaching`
   - **Database Password** : choisis un mot de passe fort (note-le)
   - **Region** : `West EU (Ireland)` (le plus proche)
5. Clique "Create new project" → attends 2 minutes

### 2.2 Crée les tables
1. Dans ton projet Supabase, clique sur **"SQL Editor"** (icône base de données à gauche)
2. Clique **"New query"**
3. Ouvre le fichier `supabase_schema.sql` avec un éditeur de texte (TextEdit sur Mac, Notepad sur Windows)
4. **Copie tout le contenu** et colle-le dans l'éditeur SQL de Supabase
5. Clique **"Run"** (bouton vert en bas à droite)
6. Tu dois voir "Success. No rows returned" → c'est bon ✅

### 2.3 Récupère tes clés
1. Dans Supabase, clique sur **"Project Settings"** (icône engrenage en bas à gauche)
2. Clique sur **"API"**
3. Note les deux valeurs :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon public key** → longue chaîne qui commence par `eyJ...`

---

## ÉTAPE 3 — Configure le projet (5 min)

1. **Télécharge le dossier** `rawrun-coaching` (il est dans tes fichiers générés)
2. **Duplique le fichier** `.env.example` et renomme la copie `.env`
3. **Ouvre `.env`** avec un éditeur de texte et remplis :

```
VITE_SUPABASE_URL=https://TONURL.supabase.co
VITE_SUPABASE_ANON_KEY=eyJtonAnnonKey...
```

Remplace avec tes vraies valeurs de l'étape 2.3.

4. **Ouvre le Terminal**, navigue jusqu'au dossier :
```bash
cd chemin/vers/rawrun-coaching
```
Sur Mac par exemple : `cd Desktop/rawrun-coaching`

5. **Installe les dépendances** :
```bash
npm install
```
Attends 1-2 minutes.

6. **Teste en local** :
```bash
npm run dev
```
Ouvre **http://localhost:5173** dans ton navigateur.
- Connecte-toi avec `RAWRUN` → tu dois voir l'interface coach ✅

---

## ÉTAPE 4 — Publie sur Vercel (5 min)

### 4.1 Crée un compte GitHub (si pas déjà fait)
1. Va sur **https://github.com** → créé un compte gratuit

### 4.2 Mets le projet sur GitHub
Dans le Terminal (dans le dossier rawrun-coaching) :
```bash
git init
git add .
git commit -m "RAWRUN Coaching init"
```
Puis :
1. Va sur **https://github.com/new**
2. Nom du repo : `rawrun-coaching`
3. Clique "Create repository"
4. Copie-colle les deux lignes `git remote add...` et `git push...` qui s'affichent dans ton Terminal

### 4.3 Déploie sur Vercel
1. Va sur **https://vercel.com** → crée un compte (connecte-toi avec GitHub)
2. Clique **"Add New Project"**
3. Sélectionne ton repo `rawrun-coaching`
4. Avant de cliquer "Deploy", clique sur **"Environment Variables"** et ajoute :
   - `VITE_SUPABASE_URL` = ton URL Supabase
   - `VITE_SUPABASE_ANON_KEY` = ta clé anon
5. Clique **"Deploy"**
6. Attends 2-3 minutes → Vercel te donne une URL comme `rawrun-coaching.vercel.app` 🎉

---

## ÉTAPE 5 — Domaine personnalisé (optionnel, 10 min)

Si tu veux `coaching.rawrun.fr` :

1. Achète le domaine sur **https://www.ovhcloud.com** (5-10€/an)
   - Cherche `rawrun.fr` ou `rawrun-coaching.fr`
2. Dans Vercel → ton projet → **"Settings" → "Domains"**
3. Ajoute ton domaine
4. Vercel te donne des enregistrements DNS à copier dans OVH
5. Attends 10-30 min que ça se propage

---

## ÉTAPE 6 — Ajoute tes athlètes

1. Connecte-toi sur ton site avec le code `RAWRUN`
2. Va dans **"Athlètes"** → "+ Ajouter"
3. Pour chaque athlète, définis :
   - Son nom
   - Son **code d'accès** (ex: `YOANN23`, `MALO25`…)
   - Sa perf 5km → les zones se calculent automatiquement
4. Envoie-lui son code + l'URL du site

---

## CODES D'ACCÈS

| Rôle | Code | Accès |
|------|------|-------|
| **Toi (coach)** | `RAWRUN` | Interface complète |
| **Chaque athlète** | Code perso défini par toi | Ses séances + chat |

---

## EN CAS DE PROBLÈME

**"npm: command not found"** → Node.js pas bien installé, recommence l'étape 1

**Page blanche sur le site** → Vérifie que tes variables `.env` sont bien configurées sur Vercel (Settings → Environment Variables)

**Erreur Supabase** → Vérifie que le SQL a bien tourné (Tables Editor dans Supabase doit montrer les 6 tables)

**Besoin d'aide** → Montre-moi l'erreur et je t'aide à la corriger

---

## RÉSUMÉ RAPIDE

```
supabase.com → créer projet → coller SQL → noter les clés
↓
fichier .env → coller les clés
↓
npm install → npm run dev → tester en local
↓
github.com → push le code
↓
vercel.com → importer → ajouter les clés → deploy
↓
🎉 rawrun-coaching.vercel.app
```
