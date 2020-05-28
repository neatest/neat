import { exec as syncExec } from "child_process";
import {
  createWriteStream,
  ensureDirSync,
  ensureFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs-extra";
import fetch from "node-fetch";
import { promisify } from "util";
import { ChunkType } from "./NeatConfig";
import { TreeType } from "./RemoteRepo";

const exec = promisify(syncExec);

export class LocalFolder {
  dir: string;
  only: RegExp | null;
  except: RegExp | null;

  constructor(
    folder = ".",
    readonly forceDownload = false,
    readonly forceInject = false,
    only: string | undefined = undefined,
    except: string | undefined = undefined
  ) {
    // https://regexr.com/54vr1
    const dir = folder.replace(/((?<!^\.|^\.\.|^)\/$|^\.$)/, "");
    // https://regexr.com/54vr7
    this.dir = /^\.*\//.test(dir) ? dir : `./${dir}/`;

    this.only = only ? new RegExp(only, "i") : null;
    this.except = except ? new RegExp(except, "i") : null;
  }

  getEnvVars(
    addedFiles: Array<string>,
    skippedFiles: Array<string>,
    addedDirs: Array<string>,
    skippedDirs: Array<string>,
    addedChunks: Array<ChunkLogType>,
    skippedChunks: Array<ChunkLogType>
  ) {
    return {
      NEAT_ALL_FILES_DIRS: addedFiles
        .concat(skippedFiles)
        .concat(addedDirs)
        .concat(skippedDirs)
        .join(", "),
      NEAT_ADDED_FILES_DIRS: addedFiles.concat(addedDirs).join(", "),
      NEAT_SKIPPED_FILES_DIRS: skippedFiles.concat(skippedDirs).join(", "),
      NEAT_ALL_FILES: addedFiles.concat(skippedFiles).join(", "),
      NEAT_ADDED_FILES: addedFiles.join(", "),
      NEAT_SKIPPED_FILES: skippedFiles.join(", "),
      NEAT_ALL_DIRS: addedDirs.concat(skippedDirs).join(", "),
      NEAT_ADDED_DIRS: addedDirs.join(", "),
      NEAT_SKIPPED_DIRS: skippedDirs.join(", "),
      NEAT_ALL_CHUNKS: addedChunks
        .concat(skippedChunks)
        .map(this.chunkToString)
        .join(", "),
      NEAT_ADDED_CHUNKS: addedChunks.map(this.chunkToString).sort().join(", "),
      NEAT_SKIPPED_CHUNKS: skippedChunks
        .map(this.chunkToString)
        .sort()
        .join(", "),
    };
  }

  // Download all files from a remote repo
  async downloadTree(
    tree: Array<TreeType>,
    ignore: Array<string>,
    preview = false
  ) {
    const addedFiles: string[] = [];
    const skippedFiles: string[] = [];
    const addedDirs: string[] = [];
    const skippedDirs: string[] = [];

    // Ensure target folder exists
    if (!preview) ensureDirSync(this.dir);

    // Create directories
    await Promise.all(
      tree
        .filter((v) => this.onlyAllowedDirsArrayFilter(v, ignore))
        .map((file) => {
          const path = `${this.dir}${file.path}`;
          if (!existsSync(path)) {
            if (!preview) mkdirSync(path);
            addedDirs.push(path);
          } else skippedDirs.push(path);
        })
    );

    // Download files
    await Promise.all(
      tree
        .filter((v) => this.onlyAllowedFilesArrayFilter(v, ignore))
        .map((file) => {
          const path = `${this.dir}${file.path}`;

          // Don't overwrite if not forcing
          if (existsSync(path) && this.forceDownload == false) {
            skippedFiles.push(path);
            Promise.resolve();
          }

          // Download files to the filesystem
          else {
            return fetch(file.url).then(async (res) => {
              if (!res.ok) throw `${path}: ${res.statusText}`;

              return new Promise((resolve, reject) => {
                if (!preview) {
                  const dest = createWriteStream(path);
                  dest
                    .on("open", function () {
                      res.body.pipe(dest);
                    })
                    .on("finish", () => {
                      resolve(true);
                      addedFiles.push(path);
                    })
                    .on("error", reject);
                } else {
                  addedFiles.push(path);
                  resolve(true);
                }
              });
            });
          }
        })
    );
    return [
      addedFiles.sort(),
      skippedFiles.sort(),
      addedDirs.sort(),
      skippedDirs.sort(),
    ];
  }

  async injectChunks(
    chunks: Array<ChunkType>,
    ignore: Array<string>,
    preview = false
  ) {
    const addedChunks: Array<ChunkLogType> = [];
    const skippedChunks: Array<ChunkLogType> = [];

    await Promise.all(
      chunks.map(async (chunk) => {
        let sourceType: string, source: string;
        if (chunk.file) {
          sourceType = "file";
          source = chunk.file;
        } else if (chunk.url) {
          sourceType = "url";
          source = chunk.url;
        } else if (chunk.command) {
          sourceType = "command";
          source = chunk.command;
        } else throw "Unknown chunk type";

        const target = this.dir + chunk.target;
        return await this.injectChunk(
          sourceType as "url" | "file" | "command",
          source,
          target,
          chunk.pattern,
          this.forceInject,
          preview
        )
          .then((injected) => {
            if (injected === true)
              addedChunks.push({
                target: target,
                source: source,
              });
            else
              skippedChunks.push({
                target: target,
                source: source,
              });
          })
          .catch((err) => {
            skippedChunks.push({
              target: target,
              source: source,
              error: err,
            });
          });
      })
    );

    return [addedChunks, skippedChunks];
  }

  async injectChunk(
    sourceType: "url" | "file" | "command",
    source: string,
    target: string,
    pattern: string,
    force = false,
    preview = false
  ) {
    let sourceContent;
    switch (sourceType) {
      case "url":
        sourceContent = await fetch(source).then((res) => res.text());
        break;
      case "file": {
        if (!existsSync(this.dir + source))
          throw `${this.dir + source} does not exist`;
        sourceContent = readFileSync(this.dir + source, "utf8");
        break;
      }
      case "command": {
        const { stdout, stderr } = await exec(source);
        // eslint-disable-next-line no-console
        if (stderr) throw stderr;
        sourceContent = stdout;
        break;
      }
    }

    if (!preview) ensureFileSync(target);

    const singlePatternRegex = new RegExp(pattern, "i");
    const doublePatternRegex = new RegExp(`${pattern}[\\s\\S]*${pattern}`, "i");
    const oldTargetContent = existsSync(target)
      ? readFileSync(target, "utf8")
      : "";

    // Remove any existing match of the pattern in the content
    sourceContent = sourceContent.replace(RegExp(pattern, "ig"), "");

    // Add the pattern at the begining and at the end of the content
    sourceContent =
      pattern +
      "\n\n" +
      sourceContent
        .replace(/^(\r\n|\n|\r)+/, "")
        .replace(/(\r\n|\n|\r)+$/, "") +
      "\n\n" +
      pattern;

    let newTargetContent = null;

    // If pattern was not found, add at the end of the file
    if (
      !singlePatternRegex.test(oldTargetContent) &&
      !doublePatternRegex.test(oldTargetContent)
    ) {
      newTargetContent =
        oldTargetContent
          .replace(/^(\r\n|\n|\r)+/, "")
          .replace(/(\r\n|\n|\r)+$/, "") +
        (/^(\r\n|\n|\r|\s)*$/.test(oldTargetContent) ? "" : "\n\n") +
        sourceContent;
    } else if (doublePatternRegex.test(oldTargetContent)) {
      if (force == true)
        newTargetContent = oldTargetContent.replace(
          doublePatternRegex,
          sourceContent
        );
    } else if (singlePatternRegex.test(oldTargetContent)) {
      newTargetContent = oldTargetContent.replace(
        singlePatternRegex,
        sourceContent
      );
    }

    if (newTargetContent) {
      if (!preview) writeFileSync(target, newTargetContent);
      return true;
    } else return false;
  }

  async replaceFiles(
    files: Array<string>,
    replacements: { [key: string]: string },
    filter: RegExp
  ) {
    const pattern = new RegExp(Object.keys(replacements).join("|"), "ig");

    return Promise.all(
      files.map((file) => {
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

  chunkToString(chunk: ChunkLogType) {
    let msg = `${chunk.target} (${chunk.source})`;
    if (chunk.error) msg = msg + " " + chunk.error;
    return msg;
  }

  onlyAllowedDirsArrayFilter(
    value: {
      path: string;
      type: string;
    },
    ignore: Array<string> = []
  ): boolean {
    return value.type == "tree"
      ? this.onlyAllowedArrayFilter(value.path, ignore)
      : false;
  }

  onlyAllowedFilesArrayFilter(
    value: {
      path: string;
      type: string;
    },
    ignore: Array<string> = []
  ): boolean {
    return value.type == "blob"
      ? this.onlyAllowedArrayFilter(value.path, ignore)
      : false;
  }

  onlyAllowedArrayFilter(path: string, ignore: Array<string>): boolean {
    const folderRegex = new RegExp(
      `^(${ignore.map((v) => v.replace(/\/$/, "")).join("|")})/`,
      "i"
    );

    if (ignore.length > 0 && (ignore.includes(path) || folderRegex.test(path)))
      return false;

    if (this.only) return this.only.test(path);
    else if (this.except) return !this.except.test(path);
    else return true;
  }
}

export type ChunkLogType = { source: string; target: string; error?: string };
