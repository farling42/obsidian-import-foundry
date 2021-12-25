import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, htmlToMarkdown } from 'obsidian';
import * as fs from 'fs/promises';

const GS_OBSIDIAN_FOLDER = "assetsLocation";


interface ImportFoundrySettings {
	GS_OBSIDIAN_FOLDER: string;
}

const DEFAULT_SETTINGS: ImportFoundrySettings = {
	[GS_OBSIDIAN_FOLDER]: "FoundryImport",
}

export default class ImportFoundry extends Plugin {
	settings: ImportFoundrySettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('magnifying-glass', 'Import Foundry', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const modal = new FileSelectorModal(this.app);
			modal.setHandler(this, this.readJournalEntries);
			modal.open();
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('import-foundry-ribbon-class');
		
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ImportFoundrySettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	validFilename(name) {
		const regexp = /[<>:"/\\|?\*]/;
		return name.replace(regexp,'_');
	}
	
	async readJournalEntries(file) {
		console.log(`Reading file ${file.path}, length ${file.size}`);
		if (file.size == 0) {
			new Notice(`File ${file.path} is empty`);
			return;
		}
		let notice = new Notice(`Starting import`, 0);

		// The base folder for the import
		let dest = this.settings[GS_OBSIDIAN_FOLDER];  // TFolder
		await app.vault.createFolder(dest).catch(er => console.log(`Destination '${dest}' already exists`));

		
		// Read set of folders
		let folderfilename = file.path.replace("journal.db","folders.db");
		let foldertext = await fs.readFile(folderfilename, /*options*/ {encoding: 'utf-8'});
		// Get all the base folders into a map,
		// this is required so we can track the .parent to determine the full path
		let folders = new Map();
		for (const line of foldertext.split('\n')) {
			if (line.length == 0) continue;
			let folder = JSON.parse(line);
			if (folder.type != 'JournalEntry') continue;
			folder.name = this.validFilename(folder.name);
			folders.set(folder._id, folder);
		}
		
		folders.forEach(async (folder) => {
			let fullname = folder.name;
			let parent   = folder.parent;
			while (parent) {
				let par = folders.get(parent);
				if (!par) break;
				fullname = par.name + '/' + fullname;
				parent = parent.parent;
			}
			fullname = dest + '/' + fullname;
			await app.vault.createFolder(fullname).catch(err => {
				if (err.message != 'Folder already exists.')
					console.error(`Failed to create folder: '${fullname}' due to ${err}`)
			});
			folder.fullname = fullname + '/';
		})
		
		// Read the journal entries
		
        let contents = await file.text().catch(er => console.error(`Failed to read file ${file.path} due to ${er}`));
		
		let entries = [];
		for (const line of contents.split('\n')) {
			if (line.length == 0) continue;
			let obj = JSON.parse(line);
			obj.filename = this.validFilename(obj.name);
			obj.markdown = htmlToMarkdown(obj.content);
			entries.push(obj);
		}
		let map = {};
		for (let item of entries) {
			map[item._id] = item.filename;
		}
		
		function convert(str, id, label) {
			let filename = map[id];
			if (label == filename)
				return `[[${filename}]]`;
			else
				return `[[${filename}|${label}]]`;
		}
		
		function findFirstDiffPos(a, b) {
			var i = 0;
			if (a === b) return -1;
			while (a[i] === b[i]) i++;
			return i;
		}

		// Path up to, but not including "worlds\"  (it uses \ not /)
		let foundryuserdata = file.path.slice(0, file.path.indexOf('worlds\\'));
		
		let filestomove = [];
		let destForImages = dest + "/zz_asset-files";
		
		function fileconvert(str, filename) {
			// See if we can grab the file.
			//console.log(`fileconvert for '${filename}'`);
			if (filename.startsWith("data:image") || filename.contains(":")) {
				// e.g.
				// http://URL
				// https://URL
				// data:image;inline binary
				console.log(`Ignoring image file/external URL: ${filename}`);
				return str;
			}
			// filename = "worlds/cthulhu/realmworksimport/sdfdsfrs.png"
			// basename = ".../worlds/cthulhu/data/journal.db"
			let basefilename = filename.slice(filename.lastIndexOf('/') + 1);
			filestomove.push( {
				srcfile: foundryuserdata + filename,
				dstfile: destForImages + '/' + basefilename
				});
			return `![[${basefilename}]]`;
		}
		
		// Replace @JournalEntry[id]{label} with [[filename-for-id]](label)
		for (let item of entries) {
			// Replace Journal Links
			if (item.markdown.includes('@JournalEntry')) {
				const pattern = /@JournalEntry\[([^\]]*)\]{([^\}]*)}/g;
				//console.log(`Replacing @JournalEntry in\n${item.markdown}`);
				item.markdown = item.markdown.replaceAll(pattern, convert);
				//console.log(`It became\n${item.markdown}`);
			}
			// Replace file references
			if (item.markdown.includes('![](')) {
				//console.log(`File ${item.filename} has images`);
				const filepattern = /!\[\]\(([^)]*)\)/g;
				item.markdown = item.markdown.replaceAll(filepattern, await fileconvert);
			}
		}
		
		// Maybe create subfolder for images
		if (filestomove.length > 0) {
			await app.vault.createFolder(destForImages).catch(er => console.log(`Destination '${dest}' already exists`));
		}
		
		// Move all the files that fileconvert found (if any)
		for (let item of filestomove) {
			const infile = await fs.open(item.srcfile);
			let body = await infile.readFile().catch(er => console.error(`Failed to read ${item.srcfile} due to ${er}`));
			if (body) {
				//console.log(`Copying file to ${item.dstfile}`);
						
				// Since we can't overwrite, delete the file if it already exists.
				let exist = app.vault.getAbstractFileByPath(item.dstfile);
				if (exist) app.vault.delete(exist);

				// Now write the image.
				await app.vault.create(item.dstfile, body);
			}
		}
		
		// Each line in the file is a separate JSON object.
		for (const item of entries) {
			// Write markdown to a file with the name of the Journal Entry
			let path = item.folder ? folders.get(item.folder).fullname : (dest + '/');
			let outfilename = path + item.filename + '.md';

			// Since we can't overwrite, delete the file if it already exists.
			let exist = app.vault.getAbstractFileByPath(outfilename);
			if (exist) app.vault.delete(exist);
			
			notice.setMessage(`Importing\n${item.filename}`);
			await app.vault.create(outfilename, item.markdown); //.then(file => new Notice(`Created note ${file.path}`));
		}
		notice.setMessage("Import Finished");
	}
}


// Popup window
class FileSelectorModal extends Modal {
	setHandler(caller,handler) {
		this.caller  = caller;
		this.handler = handler;
	}

  onOpen() {
    const setting = new Setting(this.contentEl).setName("Choose File").setDesc("Choose journal.db file to import");
    const input = setting.controlEl.createEl("input", {
      attr: {
        type: "file",
        accept: ".db"
      }
    });
	
    input.onchange = async () => {
      const { files } = input;
      if (!files.length) return;
      for (const file of files) {
		  await this.handler.call(this.caller, file);
      }
	  this.close();
    }
  }
}

class ImportFoundryModel extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ImportFoundrySettingTab extends PluginSettingTab {
	plugin: ImportFoundry;

	constructor(app: App, plugin: ImportFoundry) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for the Foundry Importer.'});

		new Setting(containerEl)
			.setName('Obsidian Data location')
			.setDesc('The name of the Obsidian folder into which all Notes will be created')
			.addText(text => text
				.setPlaceholder('obsidian-folder')
				.setValue(this.plugin.settings[GS_OBSIDIAN_FOLDER])
				.onChange(async (value) => {
					console.log(GS_OBSIDIAN_FOLDER + ': ' + value);
					this.plugin.settings[GS_OBSIDIAN_FOLDER] = value;
					await this.plugin.saveSettings();
				}));
	}
}
