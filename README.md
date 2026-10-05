# CutieQR

**CutieQR** (abrégé **QtQr**) est une application web installable (PWA) pour créer des QR codes
personnalisés et les exporter dans tous les formats utiles. Tout se passe dans le navigateur :
aucun contenu n'est envoyé sur un serveur, et l'application fonctionne hors ligne une fois installée.

**Application en ligne : https://baptistecat.github.io/cutieqr/**

## Fonctionnalités

**Contenus**
- Lien (https:// ajouté automatiquement) et texte libre
- Contact (vCard 3.0) : nom, société, fonction, téléphones, e-mail, site, adresse, note
- Événement (iCalendar) : horaires ou journée entière, lieu, description
- Lieu : coordonnées `geo:` ou lien Google Maps, bouton « Utiliser ma position »
- Virement SEPA (QR code EPC) : contrôle de l'IBAN et du BIC, montant et motif facultatifs

**Personnalisation**
- Couleurs unies, dégradés linéaires (angle réglable) ou radiaux, fond transparent
- 8 formes de modules : carrés, arrondis, fluide, points, losanges, feuilles, barres
- 5 formes pour le contour et pour le centre des yeux, couleurs distinctes possibles
- Logo central (PNG, JPEG, SVG, WebP) : taille, marge, zone carrée/arrondie/ronde, fond coloré
- Cadre : bordure, légende en haut ou en bas, ou texte seul ; police, gras, majuscules, coins arrondis
- Zone de silence et niveau de correction d'erreur réglables (automatiquement élevé avec un logo)

**QR code compact** (onglet Contenu)
- Encodage optimal en segments numériques, alphanumériques et octets, plus petite version possible,
  puis correction d'erreur relevée tant que la taille ne change pas
- Pour un lien : schéma et domaine en majuscules (sans effet sur la destination), « / » final retiré ;
  en option, « www. » et paramètres de suivi (utm_…, fbclid…) retirés
- Gain affiché (par exemple 37×37 → 25×25 modules) et adresse réellement encodée

**Aperçu**
- Scène automatique : un QR code clair sur fond transparent s'affiche sur fond sombre,
  un QR code sombre transparent sur damier ; choix manuel Auto / Damier / Clair / Sombre

**Fiabilité**
- Voyant de lecture : chaque modification est relue par un décodeur intégré (jsQR)
- Alerte de contraste insuffisant, de QR code inversé ou de fond transparent
- Motifs d'alignement dessinés d'un bloc pour rester lisibles quelle que soit la forme des modules

**Export**
- PNG, JPEG, WebP (128 à 4096 px, qualité réglable), SVG vectoriel
- PDF vectoriel prêt à imprimer : taille en mm, page ajustée ou A4/A5/A6/Letter centrée
- Copie de l'image dans le presse-papiers, partage natif sur mobile

**Organisation**
- Modèles de style : 10 fournis, et les vôtres (couleurs, formes, logo, cadre)
- Historique des QR codes exportés ou enregistrés, avec recherche ; réouverture et mise à jour
- Synchronisation entre appareils par un Gist GitHub secret
- Sauvegarde et restauration (fichier JSON)
- Brouillon conservé automatiquement, thème clair/sombre

## Synchroniser ses appareils

Les modèles et l'historique sont stockés sur chaque appareil (IndexedDB). Pour les retrouver
partout, onglet **Historique → Synchronisation entre appareils** :

1. « Créer un jeton sur GitHub » ouvre la page de création d'un jeton déjà limité au droit `gist`.
2. Collez le jeton dans CutieQR, puis « Activer la synchronisation ». Un Gist **secret** nommé
   `cutieqr-sync.json` est créé (ou retrouvé s'il existe déjà).
3. Recommencez sur chaque appareil, avec le même jeton ou un autre jeton du même compte.

La synchronisation se fait ensuite seule : après chaque enregistrement, au retour sur l'application
et au retour de la connexion. En cas de modification sur deux appareils, la plus récente l'emporte,
élément par élément ; les suppressions se propagent. Le jeton reste sur l'appareil.

Un Gist secret n'est pas listé publiquement, mais quiconque obtient son adresse peut le lire :
n'y synchronisez que des données que vous accepteriez de voir circuler.

## Installer l'application

- **Ordinateur (Chrome, Edge)** : bouton « Installer » dans l'en-tête, ou icône d'installation de la barre d'adresse.
- **Android** : menu du navigateur → « Ajouter à l'écran d'accueil » / « Installer l'application ».
- **iPhone, iPad** : Safari → Partager → « Sur l'écran d'accueil ».

## Esthétique

L'interface reprend la charte **Juritel** : jetons `--jt-*`, polices auto-hébergées (Inter,
Playfair Display, Monsieur La Doulaise), thèmes clair et sombre. `css/kit/` est une copie
**non modifiée** du kit `juritel-kit` ; `css/styles.css` ne se sert que de ses jetons.

## Développement

Aucune étape de compilation : ce sont des fichiers statiques. Pour lancer en local :

```bash
python -m http.server 8000
```

puis ouvrir http://localhost:8000. Le service worker (hors ligne) n'est activé qu'en dehors de
`localhost`, pour que les modifications soient visibles immédiatement pendant le développement.

| Fichier | Rôle |
| --- | --- |
| `index.html`, `css/styles.css` | Interface |
| `js/app.js` | Liaison des réglages, aperçu, exports, modèles, historique |
| `js/payload.js` | Construction du contenu encodé (vCard, iCalendar, EPC…) |
| `js/render.js` | Moteur de rendu : matrice QR + style → SVG |
| `js/export.js` | Rastérisation, PDF, presse-papiers, vérification de lecture |
| `js/store.js` | Stockage local (IndexedDB) |
| `js/sync.js` | Synchronisation par Gist : fusion et API GitHub (`node tools/test-sync.mjs` pour les tests) |
| `css/kit/` | Kit Juritel (jetons, polices), copié tel quel |
| `js/presets.js` | Modèles fournis |
| `sw.js`, `manifest.webmanifest` | Application installable et hors ligne |
| `icons/icon.svg` | Logo source ; `tools/make-icons.html` en tire les PNG |

**Publier une mise à jour** : pousser sur `main` suffit (GitHub Pages). Incrémenter `VERSION` dans
`sw.js` pour que les appareils où l'application est installée récupèrent les nouveaux fichiers.

## Bibliothèques incluses

Copiées dans `vendor/` pour fonctionner hors ligne :
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.5.2 (MIT),
[jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0),
[jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (MIT),
[svg2pdf.js](https://github.com/yWorks/svg2pdf.js) 2.8.1 (MIT).
Licences dans `vendor/licenses/`.
