import fetch from "node-fetch";
import { debug } from "./debug";
import { NeatConfig } from "./NeatConfig";
import { SymLinkType } from "./NeatConfigTypes";

export class RemoteRepo {
  protected static neat_repos =
    "https://raw.githubusercontent.com/olivr-com/neat/master/neat-repos.json";

  protected api_endpoint = "https://api.github.com";
  protected raw_endpoint = "https://raw.githubusercontent.com";

  protected config: NeatConfig | null = null;

  protected repository: string;
  protected branch: string;
  protected tree: Array<TreeType> = [];

  constructor(repository: string) {
    // https://regexr.com/54m91
    const urlParts = repository.match(/^\/?(([^/]+)\/([^/@]+))\/?(@(.+))?$/i);
    const repo = urlParts && urlParts[1];

    if (!repo) throw "There is an error in your repo name";

    this.repository = repo;
    this.branch = (urlParts && urlParts[5]) || "master";

    debug("RemoteRepo Object", this);
  }

  // Get repo uri of a neat repo
  public static async getNeatRepoPath(name: string) {
    const repoParts = name.match(/(^[\w\d-]+)(@.*)?$/i);

    if (!repoParts || !repoParts[1]) throw "This is no a valid repo name";

    const repoName = repoParts[1];
    const repoBranch = repoParts[2];

    return fetch(this.neat_repos)
      .then((res) => {
        if (res.ok) return res.json();
        else throw res.statusText;
      })
      .then(async (res) => {
        if (res.hasOwnProperty(repoName))
          return repoBranch ? res[repoName] + repoBranch : res[repoName];
        else throw `Cannot find this repo in the list ${this.neat_repos}`;
      });
  }

  // Get config object
  public async getConfig(): Promise<NeatConfig> {
    if (this.config == null) this.config = await this.fetchNeatConfig();
    return this.config;
  }

  // Get remote repository tree
  public async getTree(): Promise<Array<TreeType>> {
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
      .then(
        (config: string): NeatConfig =>
          new NeatConfig(
            config,
            `${this.raw_endpoint}/${this.repository}/${this.branch}/`
          )
      );
  }

  // Fetch remote repository tree
  protected async fetchTree(): Promise<Array<TreeType>> {
    await this.getConfig();

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

        const ignore: Array<string> = [];
        let ignoreNeatYml = true;

        const tree: Array<TreeType> = res.tree.map(
          (entry: { path: string; type: string }): TreeType => {
            let url = `${this.raw_endpoint}/${this.repository}/${this.branch}/${entry.path}`;

            // Replace the url for symlinks
            if (this.config && this.config.hasSymLink()) {
              this.config.symLink.forEach((symlink: SymLinkType) => {
                if (entry.path == symlink.target) {
                  url = `${this.raw_endpoint}/${this.repository}/${this.branch}/${symlink.source}`;
                  if (symlink.target == ".neat.yml") ignoreNeatYml = false;
                }
              });
            }

            return {
              path: entry.path,
              type: entry.type == "tree" ? "tree" : "blob",
              url: url,
            };
          }
        );

        // Add symlinks that do not exist already
        if (this.config && this.config.hasSymLink()) {
          this.config.symLink.forEach((symlink: SymLinkType) => {
            ignore.push(symlink.source);
            const matches = tree.filter(
              (entry) => entry.path == symlink.target
            );
            if (matches.length == 0) {
              tree.push({
                path: symlink.target,
                type: "blob",
                url: `${this.raw_endpoint}/${this.repository}/${this.branch}/${symlink.source}`,
              });
            }
          });
        }

        if (ignoreNeatYml) ignore.push(".neat.yml");
        const newTree = tree.filter((v: TreeType) => !ignore.includes(v.path));

        debug("detected repository files", newTree);

        return newTree;
      });
  }
}

export type TreeType = { path: string; type: "blob" | "tree"; url: string };
