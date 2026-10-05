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
- Sauvegarde et restauration (fichier JSON) pour retrouver ses créations sur un autre appareil
- Brouillon conservé automatiquement, thème clair/sombre

Les modèles et l'historique sont stockés **sur chaque appareil** (IndexedDB). Pour passer d'un
appareil à l'autre, utilisez « Sauvegarder mes données » puis « Restaurer… » dans l'onglet Historique.

## Installer l'application

- **Ordinateur (Chrome, Edge)** : bouton « Installer » dans l'en-tête, ou icône d'installation de la barre d'adresse.
- **Android** : menu du navigateur → « Ajouter à l'écran d'accueil » / « Installer l'application ».
- **iPhone, iPad** : Safari → Partager → « Sur l'écran d'accueil ».

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
