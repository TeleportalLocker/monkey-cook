# Internationalisation (i18n)

## Langues supportées

- **en** (anglais) – défaut
- **fr** (français)

La langue affichée suit la langue de l’interface VS Code (`vscode.env.language`).

## Fichiers

### Manifeste de l’extension (`package.json`)

- `package.nls.json` : chaînes par défaut (anglais)
- `package.nls.fr.json` : chaînes en français

Les clés sont utilisées dans `package.json` sous la forme `%cle%` (ex. `%command.openWorkflowView%`).

### Webview (onglet Monkey Cook)

- `l10n/messages-en.json` : chaînes de la webview en anglais
- `l10n/messages-fr.json` : chaînes de la webview en français

Ces fichiers sont chargés par `src/i18n.ts` en fonction de la locale et injectés dans la webview.

## Ajouter une nouvelle langue (ex. allemand)

1. **Package**  
   Créer `package.nls.de.json` à la racine en copiant `package.nls.json` et en traduisant les valeurs.

2. **Webview**  
   Créer `l10n/messages-de.json` en copiant `l10n/messages-en.json` et en traduisant les valeurs.

3. **Code**  
   Dans `src/i18n.ts`, ajouter `'de'` au tableau `SUPPORTED_LOCALES`.

VS Code utilisera automatiquement la locale correspondante selon la langue de l’éditeur.
