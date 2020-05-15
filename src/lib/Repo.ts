import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import fetch from "node-fetch";
import { NeatConfig, NeatConfigReplacementType } from "./NeatConfig";

export class Repo {
  protected static neat_repos =
    "https://raw.githubusercontent.com/olivr-com/neat/master/neat-repos.json";

  public added_dirs: Array<string> = [];
  public skipped_dirs: Array<string> = [];
  public added_files: Array<string> = [];
  public skipped_files: Array<string> = [];

  protected api_endpoint = "https://api.github.com";
  protected raw_endpoint = "https://raw.githubusercontent.com";

  protected config: NeatConfig | null = null;
  protected replacements: Array<NeatConfigReplacementType> = [];

  protected repository: string;
  protected branch: string;
  protected tree = {};

  protected dir: string;

  constructor(repository: string, folder = ".", readonly force = false) {
    // https://regexr.com/54m91
    const urlParts = repository.match(/^\/?(([^/]+)\/([^/@]+))\/?(@(.+))?$/i);
    const repo = urlParts && urlParts[1];

    if (!repo) throw "There is an error in your repo name";

    this.repository = repo;
    this.branch = (urlParts && urlParts[5]) || "master";

    const dir = folder.replace(/\/$/, "");
    this.dir = /^((\.\/)|\/)/i.test(dir) ? dir : `./${dir}`;
  }

  // Get repo uri of a neat repo
  public static async getNeatRepoPath(name: string) {
    return fetch(this.neat_repos)
      .then((res) => {
        if (res.ok) return res.json();
        else throw res.statusText;
      })
      .then(async (res) => {
        if (res.hasOwnProperty(name)) return res[name];
        else throw `Cannot find this repo in the list ${this.neat_repos}`;
      });
  }

  // Get config object
  public async getConfig(): Promise<NeatConfig> {
    return this.config || this.fetchNeatConfig();
  }

  public hasAddedFiles() {
    return this.added_files && this.added_files.length > 0 ? true : false;
  }

  public hasSkippedFiles() {
    return this.skipped_files && this.skipped_files.length > 0 ? true : false;
  }

  // Get array of all files and directories
  public getAllFilesAndDirs() {
    return this.added_files
      .concat(this.skipped_files)
      .concat(this.added_dirs)
      .concat(this.skipped_dirs)
      .join(" ");
  }

  // Get array of added files and directories
  public getAddedFilesAndDirs() {
    return this.added_files.concat(this.added_dirs).join(" ");
  }

  // Get array of skipped files and directories
  public getSkippedFilesAndDirs() {
    return this.skipped_files.concat(this.skipped_dirs).join(" ");
  }

  // Get array of all directories
  public getAllDirs() {
    return this.added_dirs.concat(this.skipped_dirs).join(" ");
  }

  // Get array of added directories
  public getAddedDirs() {
    return this.added_dirs.join(" ");
  }

  // Get array of skipped directories
  public getSkippedDirs() {
    return this.skipped_dirs.join(" ");
  }

  // Get array of all files
  public getAllFiles() {
    return this.added_files.concat(this.skipped_files).join(" ");
  }

  // Get array of added files
  public getAddedFiles() {
    return this.added_files.join(" ");
  }

  // Get array of skipped files
  public getSkippedFiles() {
    return this.skipped_files.join(" ");
  }

  // Download all files for a repo
  public async downloadFiles() {
    return this.getTree().then(
      async (tree: Array<{ path: string; type: string }>) => {
        // Ensure target folder exists
        if (!existsSync(this.dir)) mkdirSync(this.dir);

        // Create subfolders
        await Promise.all(
          tree.filter(this.onlyTreesArrayFilter).map((file) => {
            const path = `${this.dir}/${file.path}`;
            if (!existsSync(path)) {
              mkdirSync(path);
              this.added_dirs.push(path);
            } else this.skipped_dirs.push(path);
          })
        );

        // Download files
        await Promise.all(
          tree
            .filter(this.onlyFilesArrayFilter)
            .map((file: { path: string; type: string }) => {
              const path = `${this.dir}/${file.path}`;

              // Do not download the neat config file
              if (file.path == ".neat.yml") return;

              // Don't overwrite if not forcing
              if (existsSync(path) && this.force == false) {
                this.skipped_files.push(path);
              }

              // Download files to the filesystem
              else {
                return fetch(
                  `${this.raw_endpoint}/${this.repository}/${this.branch}/${file.path}`
                ).then(async (res) => {
                  if (!res.ok) throw `${path}: ${res.statusText}`;

                  return new Promise((resolve, reject) => {
                    const dest = createWriteStream(path);
                    dest
                      .on("open", function () {
                        res.body.pipe(dest);
                      })
                      .on("finish", () => {
                        resolve(true);
                        this.added_files.push(path);
                      })
                      .on("error", reject);
                  });
                });
              }
            })
        );
      }
    );
  }

  public async replaceFiles(
    replacements: { [key: string]: string },
    filter: RegExp
  ) {
    const pattern = new RegExp(Object.keys(replacements).join("|"), "ig");

    return Promise.all(
      this.added_files.map((file) => {
        new Promise(() => {
          if (filter.test(file)) {
            const content = readFileSync(file, "utf8");
            const newContent = content.replace(pattern, function (match) {
              return replacements[match];
            });
            writeFileSync(file, newContent);
          }
        });
      })
    );
  }

  // Get remote repository tree
  protected async getTree() {
    return Object.keys(this.tree).length > 0
      ? this.tree
      : await this.fetchTree();
  }

  // Get neat config from remote file
  protected async fetchNeatConfig(): Promise<NeatConfig> {
    return fetch(
      `${this.raw_endpoint}/${this.repository}/${this.branch}/.neat.yml`
    )
      .then((res): string | Promise<string> => {
        if (res.ok) return res.text();
        else return "";
      })
      .then((config: string): NeatConfig => new NeatConfig(config));
  }

  // Fetch remote repository tree
  protected async fetchTree() {
    return fetch(
      `${this.api_endpoint}/repos/${this.repository}/git/trees/${this.branch}?recursive=1`
    )
      .then((res) => {
        if (res.ok) return res.json();
        else throw res.statusText;
      })
      .then((res) => {
        if (!res.tree || res.tree.length == 0)
          throw `${this.repository}@${this.branch} is empty`;
        return res.tree;
      });
  }

  protected onlyTreesArrayFilter(value: { type: string }) {
    return value.type == "tree";
  }

  protected onlyFilesArrayFilter(value: { type: string }) {
    return value.type == "blob";
  }
}
