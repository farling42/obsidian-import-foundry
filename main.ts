import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, htmlToMarkdown } from 'obsidian';
import * as fs from 'fs/promises';
import * as Electron from 'electron';  // to gain definition for File.prototype.path for Typescript

const GS_OBSIDIAN_FOLDER = "assetsLocation";

/**
 * This relies in File.prototype.path, which exists in the Obsidian.md/Electron environment, but not in other browsers!
 */

interface ImportFoundrySettings {
	[GS_OBSIDIAN_FOLDER]: string;
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
	
	validFilename(name:string) {
		const regexp = /[<>:"/\\|?\*]/;
		return name.replace(regexp,'_');
	}
	
	async readDB(dbfile: string|File) : Promise<any[]> {
		let contents = 
			(typeof dbfile == "string")
			? await fs.readFile(dbfile, /*options*/ {encoding: 'utf-8'}).catch(er => console.error(`Failed to read file ${dbfile} due to ${er}`))
			: await dbfile.text().catch(er => console.error(`Failed to read file ${dbfile} due to ${er}`));

		if (!contents) return undefined;

		let result : any[] = [];
		for (const line of contents.split('\n')) {
			if (line.length == 0) continue;
			result.push(JSON.parse(line));
		}
		return result;
	}

	async readJournalEntries(file:File) {
		console.log(`Reading file ${file.path}, length ${file.size}`);
		if (file.size == 0) {
			new Notice(`File ${file.path} is empty`);
			return;
		}
		let notice = new Notice(`Starting import`, 0);

		// The base folder for the import
		let dest = this.settings[GS_OBSIDIAN_FOLDER];  // TFolder
		await this.app.vault.createFolder(dest).catch(er => console.log(`Destination '${dest}' already exists`));
		
		// Read set of folders
		// Get all the base folders into a map,
		// this is required so we can track the .parent to determine the full path
		let folderdb = await this.readDB(file.path.replace("journal.db","folders.db"));
		let folders = new Map<string,any>();
		for (let folder of folderdb) {
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
			await this.app.vault.createFolder(fullname).catch(err => {
				if (err.message != 'Folder already exists.')
					console.error(`Failed to create folder: '${fullname}' due to ${err}`)
			});
			folder.fullname = fullname + '/';
		})
		
		// Read the journal entries
		interface FoundryEntry {
			// The following are explicitly added by us.
			filename: string;
			markdown: string;
			// The following are from the JSON.parse decoding.
			_id: string;
			folder: string;
		}
		
		let journaldb = await this.readDB(file);
		if (!journaldb) return;

		let entries : FoundryEntry[] = [];
		for (let obj of journaldb) {
			obj.filename = this.validFilename(obj.name);
			obj.markdown = htmlToMarkdown(obj.content);
			entries.push(obj);
		}
		const map = new Map<string,string>();
		for (let item of entries) {
			map.set(item._id, item.filename);
		}
		
		function convert(str:string, id:string, label:string) {
			let filename = map.get(id);
			if (label == filename)
				return `[[${filename}]]`;
			else
				return `[[${filename}|${label}]]`;
		}
		
		// Path up to, but not including "worlds\"  (it uses \ not /)
		let foundryuserdata = file.path.slice(0, file.path.indexOf('worlds\\'));
		
		interface MoveFile {
			srcfile: string;
			dstfile: string;
		}
		let filestomove: MoveFile[] = [];
		let destForImages = dest + "/zz_asset-files";
		
		function fileconvert(str:string, filename:string) {
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
			await this.app.vault.createFolder(destForImages).catch(er => console.log(`Destination '${destForImages}' already exists`));
		}
		
		// Move all the files that fileconvert found (if any)
		notice.setMessage('Transferring image/binary files');
		for (let item of filestomove) {
			// await required to avoid ENOENT error (too many copies/writes)
			await fs.readFile(item.srcfile)
			.then(async (body) => {
				//console.log(`Copying file to ${item.dstfile}`);
						
				// Since we can't overwrite, delete the file if it already exists.
				let exist = this.app.vault.getAbstractFileByPath(item.dstfile);
				if (exist) await this.app.vault.delete(exist).catch(err => console.error(`Failed to delete existing asset file ${item.dstfile} due to ${err}`));

				// Now write the image file
				await this.app.vault.createBinary(item.dstfile, body)
					.catch(err => console.error(`Failed to create asset file ${item.dstfile} due to ${err}`));
			})
			.catch(er => console.error(`Failed to read ${item.srcfile} due to ${er}`));
		}
		
		// Each line in the file is a separate JSON object.
		for (const item of entries) {
			// Write markdown to a file with the name of the Journal Entry
			let path = item.folder ? folders.get(item.folder).fullname : (dest + '/');
			let outfilename = path + item.filename + '.md';

			// Since we can't overwrite, delete the file if it already exists.
			let exist = this.app.vault.getAbstractFileByPath(outfilename);
			if (exist) await this.app.vault.delete(exist);
			
			notice.setMessage(`Importing\n${item.filename}`);
			await this.app.vault.create(outfilename, item.markdown); //.then(file => new Notice(`Created note ${file.path}`));
		}
		notice.setMessage("Import Finished");
	}
}


// Popup window
class FileSelectorModal extends Modal {
	caller: Object;
	handler: Function;
	setHandler(caller:Object, handler:Function): void {
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
	  for (let i=0; i<files.length; i++) {
		  await this.handler.call(this.caller, files[i]);
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
