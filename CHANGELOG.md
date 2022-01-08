# 0.5.0
Ensure deleted entries in the neDB files are ignored.

Remove all uses of .foreach() and .then().

# 0.4.0
Add option to have a note created for each folder (for folder note plugins).

Ensure that full hierarchy of folders is created, not just the first level.

Add title and aliases for the real entry name at the top of each created note.

# 0.3.0
Get detection of @JournalEntry working correctly again since the GFM module escapes the square brackets.

# 0.2.0
Switch from using internal htmlToMarkdown to using our own instantiation of turndown which includes the GFM module so that tables are supported.

Fix issues with filenames not being converted properly to include only valid characters.

Don't crash if a linked file doesn't exist.

# 0.1.0
Initial release that imports only journal.db