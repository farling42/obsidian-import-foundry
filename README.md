[![ko-fi](https://img.shields.io/badge/Ko--Fi-farling-success)](https://ko-fi.com/farling)
[![patreon](https://img.shields.io/badge/Patreon-amusingtime-success)](https://patreon.com/amusingtime)
[![paypal](https://img.shields.io/badge/Paypal-farling-success)](https://paypal.me/farling)
![GitHub License](https://img.shields.io/github/license/farling42/obsidian-import-foundry)
![Latest Release Download Count](https://img.shields.io/github/downloads/farling42/obsidian-import-foundry/latest/main.js)


## Foundry Journal Importer

This is a simple plugin to transform the journal.db file from the Foundry VTT into separate notes in your Obsidian Vault.

When this plugin is enabled an additional magnifying icon appears in the left bar.

Selecting the icon will prompt with a simple popup where you can select the journal.db file to be imported. This can be found in your Foundry User Data area under /worlds/<yourworld>/data/journal.db

You can also specify the folder within your vault into which all the journal entries will be created. If the folder doesn't already exist then it will be created. Any existing note with the same name as a journal entry will be removed.

Press the IMPORT button to start the importing.

The folder structure of your Journal Entries will be read from the folders.db file in the same folder as your selected journal.db and used to store the created notes.

Any images and other files which are referenced from your journal entries wil be put into a sub-folder called "zz_asset-files" if they can be located within your Foundry user data area. If any image isn't copied, then a report will appear in the Obsidian dev log (open with ctrl+shift+i on MS windows).
