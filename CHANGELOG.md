# CHANGELOG

## 0.8.3

- Add extra progress messages for people with LARGE foundry journal DBs (e.g. 1,000s of entries).

## 0.8.2

- Prevent import stopping if a V10 journal page has no content.

## 0.8.1

- Generate a console warning if the parent for a journal entry/page is not found in the list of available folders.

## 0.8.0

- Support Foundry V10 (as well as V9) journal formats. Any V10 journal with a single page will generate a single page as done for V9. Any V10 journal with more than one page will have a parent folder created for the journal, and each page created as a note within that folder.
- Ensure that foundry links that include section names are handled properly.

## 0.7.2

Adds an error handler around the conversion being done by the Turndown library to avoid the import stopping prematurely.

## 0.7.1

Frontmatter of each note should be surrounded by --- not ```

## 0.7.0

Incorporate two improvement made by zombiecalypse:

- The presence of the magnifying glass icon in the left ribbon bar is optional (default enabled, but can be disabled in the "Plugin Options" for this module)
- A Hotkey can be configured to open the import dialogue (look for the hotkey named "Import Foundry VTT journal entries: Import Foundry journal.db")

## 0.6.0

When failing to migrate an image, report the name of the journal entry in which it occurs.

Update README.md to match the current usage.

## 0.5.0

Ensure deleted entries in the neDB files are ignored.

Remove all uses of .foreach() and .then().

## 0.4.0

Add option to have a note created for each folder (for folder note plugins).

Ensure that full hierarchy of folders is created, not just the first level.

Add title and aliases for the real entry name at the top of each created note.

## 0.3.0

Get detection of @JournalEntry working correctly again since the GFM module escapes the square brackets.

## 0.2.0

Switch from using internal htmlToMarkdown to using our own instantiation of turndown which includes the GFM module so that tables are supported.

Fix issues with filenames not being converted properly to include only valid characters.

Don't crash if a linked file doesn't exist.

## 0.1.0

Initial release that imports only journal.db
