# 0.3.0
Get detection of @JournalEntry working correctly again since the GFM module escapes the square brackets.

# 0.2.0
Switch from using internal htmlToMarkdown to using our own instantiation of turndown which includes the GFM module so that tables are supported.

Fix issues with filenames not being converted properly to include only valid characters.

Don't crash if a linked file doesn't exist.

# 0.1.0
Initial release that imports only journal.db