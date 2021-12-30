## Foundry Journal Importer

This is a simple plugin to transform the journal.db file from the Foundry VTT into separate notes in your Obsidian Vault.

When this plugin is enabled an additional magnifying icon appears in the left bar, as well as having a single configuration parameter.

In the Plugin Options window, you can find the "Import Foundry VTT journal entries" plugin where you can set the name of the folder inside your Vault into which all the files will be created.

Selecting the icon will prompt with a simple popup where you can select the journal.db file to be imported. This can be found in your Foundry User Data area under /worlds/<yourworld>/data/journal.db

Once the file is selected, the importer will immediately start creating notes in your Vault.

The folder structure of your Journal Entries will be read from the folders.db file in the same folder as your selected journal.db and used to store the created notes.

Any images and other files which are referenced from your journal entries wil be put into a sub-folder called "images" if they can be located within your Foundry user data area.