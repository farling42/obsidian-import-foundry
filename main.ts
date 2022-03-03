import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, htmlToMarkdown, AbstractTextComponent } from 'obsidian';
import * as fs from 'fs/promises';
import * as Electron from 'electron';  // to gain definition for File.prototype.path for Typescript

let TurndownService   = require('turndown');
let turndownPluginGfm = require('turndown-plugin-gfm');

const GS_OBSIDIAN_FOLDER = "assetsLocation";
const GS_FOLDER_NOTES = "createFolderNotes";
const GS_SHOW_RIBBON = "showRibbon";

/**
 * This relies in File.prototype.path, which exists in the Obsidian.md/Electron environment, but not in other browsers!
 */

interface ImportFoundrySettings {
	[GS_OBSIDIAN_FOLDER]: string;
	[GS_FOLDER_NOTES]: boolean;
	[GS_SHOW_RIBBON]: boolean;
}

const DEFAULT_SETTINGS: ImportFoundrySettings = {
	[GS_OBSIDIAN_FOLDER]: "FoundryImport",
	[GS_FOLDER_NOTES]: false,
	[GS_SHOW_RIBBON]: true
}

export default class ImportFoundry extends Plugin {
	settings: ImportFoundrySettings;
	gfm: any;
	turndownService: any;
	create_folder_notes: boolean;
	ribbonIconEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		if (this.settings[GS_SHOW_RIBBON]) {
			this.createRibbon();
		}
		this.addCommand({
			id: 'import-foundry',
			name: 'Import Foundry journal.db',
			callback: () => {
				// Called when the user clicks the icon.
				const modal = new FileSelectorModal(this.app);
				modal.setHandler(this, this.readJournalEntries, this.settings[GS_OBSIDIAN_FOLDER], this.settings[GS_FOLDER_NOTES]);
				modal.open();
			}
		});

		this.addSettingTab(new FoundryImportSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	createRibbon() {
		// This creates an icon in the left ribbon.
		this.ribbonIconEl = this.addRibbonIcon('magnifying-glass', 'Import Foundry', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const modal = new FileSelectorModal(this.app);
			modal.setHandler(this, this.readJournalEntries, this.settings[GS_OBSIDIAN_FOLDER], this.settings[GS_FOLDER_NOTES]);
			modal.open();
		});
		// Perform additional things with the ribbon
		this.ribbonIconEl.addClass('import-foundry-ribbon-class');
	}

	destroyRibbon() {
		this.ribbonIconEl.remove();
	}
	
	validFilename(name:string) {
		const regexp = /[<>:"/\\|?*]/g;
		return name.replaceAll(regexp,'_');
	}
	
	async readDB(dbfile: string|File) : Promise<any[]> {
		let contents = 
			(typeof dbfile == "string")
			? await fs.readFile(dbfile, /*options*/ {encoding: 'utf-8'}).catch(err => console.error(`Failed to read file ${dbfile} due to ${err}`))
			: await dbfile.text().catch(err => console.error(`Failed to read file ${dbfile} due to ${err}`));

		if (!contents) return undefined;

		let result : any[] = [];
		for (const line of contents.split('\n')) {
			// Ignore deleted lines
			if (line.length == 0 || line.contains('"$$deleted":true')) continue;
			result.push(JSON.parse(line));
		}
		return result;
	}

	convertHtml(html:string) {
		// htmlToMarkdown does not handle tables properly!
		if (!this.turndownService) {
			// Setup Turndown service to use GFM for tables
			this.turndownService = new TurndownService({ headingStyle: "atx" });
			this.gfm = turndownPluginGfm.gfm;
			this.turndownService.use(this.gfm);
		}

		let markdown:string = this.turndownService.turndown(html);

		return markdown;
	}

	async readJournalEntries(file:File, topfoldername:string, createFolderNotes:boolean) {

		async function deleteIfExists(app:any, filename:string) {
			let exist = app.vault.getAbstractFileByPath(filename);
			if (exist) await app.vault.delete(exist).catch(err => console.log(`Failed to delete ${filename} due to ${err}`));
		}

		let sourcepath=file.path;   // File#path is an extension provided by the Electron browser
		console.log(`Reading file ${sourcepath}, length ${file.size}`);
		if (file.size == 0) {
			new Notice(`File ${sourcepath} is empty`);
			return;
		}
		let notice = new Notice(`Starting import`, 0);
		// Create folder notes if we have the folder notes plugin enabled.
		this.create_folder_notes = createFolderNotes;

		// The base folder for the import
		await this.app.vault.createFolder(topfoldername).catch(err => console.log(`Destination '${topfoldername}' already exists`));
		
		// Read the folders DB.
		let folderdb = await this.readDB(sourcepath.replace("journal.db","folders.db"));

		// Get all the base folders (for Journal Entries only) into a map,
		// this is required so we can track the .parent to determine the full path
		let folders = new Map<string,any>();
		for (let folder of folderdb) {
			if (folder.type != 'JournalEntry') continue;
			folder.filename = this.validFilename(folder.name);
			folders.set(folder._id, folder);
		}
		
		for (let folder of folders.values()) {
			let fullpath = folder.filename;
			let parentid = folder.parent;
			while (parentid) {
				let parentobj = folders.get(parentid);
				if (!parentobj) break;
				fullpath = parentobj.filename + '/' + fullpath;
				parentid = parentobj.parent;
			}
			fullpath = topfoldername + '/' + fullpath;
			await this.app.vault.createFolder(fullpath).catch(err => {
				if (err.message != 'Folder already exists.')
					console.error(`Failed to create folder: '${fullpath}' due to ${err}`)
			});
			folder.fullpath = fullpath + '/';
			if (this.create_folder_notes) {
				let notepath = folder.fullpath + folder.filename + ".md";
				// Delete old note if it already exists
				await deleteIfExists(this.app, notepath);

				let foldernote = "```\n" + `title: "${folder.name}"\n` + `aliases: "${folder.name}"\n` + "```\n" + `# ${folder.name}\n`;
				await this.app.vault.create(notepath, foldernote);
			}
		}
		
		// Read the journal entries
		interface FoundryEntry {
			// The following are explicitly added by us.
			filename: string;
			markdown: string;
			// The following are from the JSON.parse decoding.
			_id: string;
			folder: string;
		}
		
		// Read the Journal DB
		let journaldb = await this.readDB(file);
		if (!journaldb) return;

		let entries : FoundryEntry[] = [];
		for (let obj of journaldb) {
			obj.filename = this.validFilename(obj.name);

			let markdown:string = this.convertHtml(obj.content);
			// Put ID into frontmatter (for later imports)
			if (markdown) {
				markdown = "```\n" + `title: "${obj.name}"\n` + `aliases: "${obj.name}"\n` + `foundryId: journal-${obj._id}\n` + "```\n" + markdown;
			}
			obj.markdown = markdown;
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
		let foundryuserdata = sourcepath.slice(0, sourcepath.indexOf('worlds\\'));
		
		interface MoveFile {
			srcfile: string;
			dstfile: string;
			entryName: string;
		}
		let filestomove: MoveFile[] = [];
		let destForImages = topfoldername + "/zz_asset-files";
		let currententry:string;
		
		function fileconvert(str:string, filename:string) {
			// See if we can grab the file.
			//console.log(`fileconvert for '${filename}'`);
			if (filename.startsWith("data:image") || filename.contains(":")) {
				// e.g.
				// http://URL
				// https://URL
				// data:image;inline binary
				console.log(`Ignoring image file/external URL in '${currententry}':\n${filename}`);
				return str;
			}
			filename = filename.replaceAll('%20', ' ');
			// filename = "worlds/cthulhu/realmworksimport/sdfdsfrs.png"
			// basename = ".../worlds/cthulhu/data/journal.db"
			let basefilename = filename.slice(filename.lastIndexOf('/') + 1);
			filestomove.push( {
				srcfile: foundryuserdata + filename,
				dstfile: destForImages + '/' + basefilename,
				entryName: currententry,
				});
			return `![[${basefilename}]]`;
		}
		
		// Replace @JournalEntry\[id\]{label} with [[filename-for-id]](label)
		for (let item of entries) {
			// Replace Journal Links
			if (item.markdown.includes('@JournalEntry')) {
				// The square brackets in @JournalEntry will already have been escaped!
				const pattern = /@JournalEntry\\\[([^\]]*)\\\]{([^\}]*)}/g;
				//console.log(`Replacing @JournalEntry in\n${item.markdown}`);
				item.markdown = item.markdown.replaceAll(pattern, convert);
				//console.log(`Replaced @JournalEntry to became\n${item.markdown}`);
			}
			// Replace file references
			if (item.markdown.includes('![](')) {
				//console.log(`File ${item.filename} has images`);
				const filepattern = /!\[\]\(([^)]*)\)/g;
				currententry = item.filename;
				item.markdown = item.markdown.replaceAll(filepattern, fileconvert);
			}
			// Check for PDFoundry?
			//if (item.flags?.pdfoundry?.PDFData?.url)
		}
		
		// Maybe create subfolder for images
		if (filestomove.length > 0) {
			await this.app.vault.createFolder(destForImages).catch(err => console.log(`Destination '${destForImages}' already exists`));
		}
		
		this.settings[GS_OBSIDIAN_FOLDER] = topfoldername;
		this.settings[GS_FOLDER_NOTES]    = createFolderNotes;
		this.saveSettings();

		// Move all the files that fileconvert found (if any)
		notice.setMessage('Transferring image/binary files');
		for (let item of filestomove) {
			// await required to avoid ENOENT error (too many copies/writes)
			let body = await fs.readFile(item.srcfile).catch(err => { console.error(`Failed to read ${item.srcfile} from '${item.entryName}' due to ${err}`); return null});
			if (body) {
				//console.log(`Copying file to ${item.dstfile}`);

				// Since we can't overwrite, delete the file if it already exists.
				await deleteIfExists(this.app, item.dstfile);

				// Now write the image file
				await this.app.vault.createBinary(item.dstfile, body)
					.catch(err => console.error(`Failed to create asset file ${item.dstfile} due to ${err}`));
			}
		}
		
		// Each line in the file is a separate JSON object.
		for (const item of entries) {
			// Write markdown to a file with the name of the Journal Entry
			let path = item.folder ? folders.get(item.folder).fullpath : (topfoldername + '/');
			let outfilename = path + item.filename + '.md';

			// Since we can't overwrite, delete the file if it already exists.
			await deleteIfExists(this.app, outfilename);
			
			notice.setMessage(`Importing\n${item.filename}`);
			await this.app.vault.create(outfilename, item.markdown)
				.catch(err => new Notice(`Creating Note for ${item.filename} failed due to ${err}`));
		}
		notice.setMessage("Import Finished");
	}
}


// Popup window
class FileSelectorModal extends Modal {
	caller: Object;
	handler: Function;
	foldername: string;
	createFolderNote: boolean;

	setHandler(caller:Object, handler:Function, foldername:string, createFolderNote:boolean): void {
		this.caller  = caller;
		this.handler = handler;
		this.foldername = foldername;
		this.createFolderNote = createFolderNote;
	}

  onOpen() {
    const setting1 = new Setting(this.contentEl).setName("Choose File").setDesc("Choose journal.db file to import");
    const input1 = setting1.controlEl.createEl("input", {
      attr: {
        type: "file",
        accept: ".db"
      }
    });
    const setting2 = new Setting(this.contentEl).setName("Parent Folder").setDesc("Enter the name of the Obsidian folder into which the data will be imported");
    const input2 = setting2.controlEl.createEl("input", {
      attr: {
        type: "string"
      }
    });
	input2.value = this.foldername;

    const setting3 = new Setting(this.contentEl).setName("Create Folder Notes").setDesc("When checked, a note with the same name as the folder will be created in each folder (e.g. for AidenLX's Folder Notes plugin)");
    const input3 = setting3.controlEl.createEl("input", {
      attr: {
        type: "checkbox"
      }
    });
	input3.checked = this.createFolderNote;

    const setting4 = new Setting(this.contentEl).setName("Process").setDesc("Click this button to start the import");
    const input4 = setting4.controlEl.createEl("button");
	input4.textContent = "IMPORT";
	
    input4.onclick = async () => {
      const { files } = input1;
      if (!files.length) return;
	  for (let i=0; i<files.length; i++) {
		  await this.handler.call(this.caller, files[i], input2.value, input3.checked);
      }
	  this.close();
    }
  }
}

class FoundryImportSettingTab extends PluginSettingTab {
	plugin: ImportFoundry;

	constructor(app: App, plugin: ImportFoundry) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for Foundry Import.' });

		new Setting(containerEl)
			.setName('Show ribbon')
			.setDesc('When selected, shows the magnifying glass in the left ribbon bar to import foundry journal.db files')
			.addToggle(text => text
				.setValue(this.plugin.settings[GS_SHOW_RIBBON])
				.onChange(async (value) => {
					this.plugin.settings[GS_SHOW_RIBBON] = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.createRibbon();
					} else {
						this.plugin.destroyRibbon();
					}
				}));
	}
}
