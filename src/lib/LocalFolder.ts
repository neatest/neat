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
import escapeRegExp from "lodash.escaperegexp";
import fetch from "node-fetch";
import { promisify } from "util";
import { debug } from "./debug";
import { ChunkType } from "./NeatConfigTypes";
import { TreeType } from "./RemoteRepo";

const exec = promisify(syncExec);

export class LocalFolder {
  dir: string;
  only: RegExp | null;
  except: RegExp | null;

  constructor(
    readonly forceDownload = false,
    readonly forceInject = false,
    only: string | undefined = undefined,
    except: string | undefined = undefined,
    folder = ""
  ) {
    // https://regexr.com/54vr1
    const dir = folder.replace(/((?<!^\.|^\.\.|^)\/$|^\.$)/, "");
    // https://regexr.com/54vr7
    this.dir = dir ? (/^\.*\//.test(dir) ? dir : `./${dir}/`) : "./";

    this.only = only ? new RegExp(only, "i") : null;
    this.except = except ? new RegExp(except, "i") : null;

    debug("LocalFolder Object", this);
  }

  getEnvVars(
    addedFiles: Array<string>,
    skippedFiles: Array<string>,
    addedDirs: Array<string>,
    skippedDirs: Array<string>,
    addedChunks: Array<ChunkLogType>,
    skippedChunks: Array<ChunkLogType>
  ): Array<{ name: string; value: string }> {
    return [
      {
        name: "NEAT_ALL_FILES_DIRS",
        value: addedFiles
          .concat(skippedFiles)
          .concat(addedDirs)
          .concat(skippedDirs)
          .join(", "),
      },
      {
        name: "NEAT_ADDED_FILES_DIRS",
        value: addedFiles.concat(addedDirs).join(", "),
      },
      {
        name: "NEAT_SKIPPED_FILES_DIRS",
        value: skippedFiles.concat(skippedDirs).join(", "),
      },
      {
        name: "NEAT_ALL_FILES",
        value: addedFiles.concat(skippedFiles).join(", "),
      },
      {
        name: "NEAT_ADDED_FILES",
        value: addedFiles.join(", "),
      },
      {
        name: "NEAT_SKIPPED_FILES",
        value: skippedFiles.join(", "),
      },
      {
        name: "NEAT_ALL_DIRS",
        value: addedDirs.concat(skippedDirs).join(", "),
      },
      {
        name: "NEAT_ADDED_DIRS",
        value: addedDirs.join(", "),
      },
      {
        name: "NEAT_SKIPPED_DIRS",
        value: skippedDirs.join(", "),
      },
      {
        name: "NEAT_ALL_CHUNKS",
        value: addedChunks
          .concat(skippedChunks)
          .map(this.chunkToString)
          .join(", "),
      },
      {
        name: "NEAT_ADDED_CHUNKS",
        value: addedChunks.map(this.chunkToString).sort().join(", "),
      },
      {
        name: "NEAT_SKIPPED_CHUNKS",
        value: skippedChunks.map(this.chunkToString).sort().join(", "),
      },
    ];
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
        .filter((v) => this.isAllowedDir(v, ignore))
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
        .filter((v) => this.isAllowedFile(v, ignore))
        .map((file) => {
          const path = `${this.dir}${file.path}`;

          // Don't overwrite if not forcing
          if (existsSync(path) && this.forceDownload === false) {
            skippedFiles.push(path);
            Promise.resolve();
          }

          // Download files to the filesystem
          else {
            return fetch(file.url).then(async (res) => {
              if (!res.ok) throw `${path}: ${res.statusText}`;

              return new Promise((resolve, reject) => {
                if (!preview) {
                  ensureFileSync(path);
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
    preview = false,
    onlyFiles: Array<string> | null = null,
    replacements: { [key: string]: string } = {},
    filter = /.*/i
  ) {
    const addedChunks: Array<ChunkLogType> = [];
    const skippedChunks: Array<ChunkLogType> = [];
    const unknownChunks: Array<ChunkLogType> = [];

    for (const originalChunk of chunks) {
      const chunk = { ...originalChunk };
      chunk.target = this.dir + chunk.target;
      const source = (chunk.file || chunk.url || chunk.command) as string;

      if (preview === true && chunk.command)
        unknownChunks.push({
          target: chunk.target,
          source: source,
        });
      else if (
        !this.forceInject &&
        existsSync(chunk.target) &&
        onlyFiles != null &&
        !onlyFiles.includes(chunk.target)
      ) {
        skippedChunks.push({
          target: chunk.target,
          source: source,
        });
      } else
        await this.injectChunk(chunk, preview, replacements, filter)
          .then((injected) => {
            if (injected === true)
              addedChunks.push({
                target: chunk.target,
                source: source,
              });
            else
              skippedChunks.push({
                target: chunk.target,
                source: source,
              });
          })
          .catch((err) => {
            skippedChunks.push({
              target: chunk.target,
              source: source,
              error: err,
            });
          });
    }

    return {
      addedChunks: addedChunks,
      skippedChunks: skippedChunks,
      unknownChunks: unknownChunks,
    };
  }

  async injectChunk(
    chunk: ChunkType,
    preview = false,
    replacements: { [key: string]: string },
    filter: RegExp
  ) {
    let sourceContent = "";

    if (chunk.file) {
      if (!existsSync(this.dir + chunk.file))
        throw `${this.dir + chunk.file} does not exist`;
      sourceContent = readFileSync(this.dir + chunk.file, "utf8");
      sourceContent = this.replaceContent(
        sourceContent,
        replacements,
        chunk.file,
        filter
      );
    } else if (chunk.url) {
      sourceContent = await fetch(chunk.url).then((res) => res.text());
      sourceContent = this.replaceContent(
        sourceContent,
        replacements,
        chunk.url,
        filter
      );
    } else if (chunk.command) {
      const { stdout, stderr } = await exec(chunk.command);
      if (stderr) throw stderr;
      sourceContent = stdout;
    }

    if (!existsSync(chunk.target) && !chunk.if.includes("no-file"))
      return false;

    const escapedPattern = escapeRegExp(chunk.pattern);
    const singlePatternRegex = new RegExp(escapedPattern, "i");
    const doublePatternRegex = new RegExp(
      `${escapedPattern}[\\s\\S]*${escapedPattern}`,
      "i"
    );
    const oldTargetContent = existsSync(chunk.target)
      ? readFileSync(chunk.target, "utf8")
      : "";

    // Remove any existing match of the pattern in the content
    sourceContent = sourceContent.replace(RegExp(escapedPattern, "ig"), "");

    // Add the pattern at the begining and at the end of the content
    sourceContent =
      chunk.pattern +
      "\n\n" +
      sourceContent
        .replace(/^(\r\n|\n|\r)+/, "")
        .replace(/(\r\n|\n|\r)+$/, "") +
      "\n\n" +
      chunk.pattern;

    let newTargetContent = null;

    // If file was not found
    if (!existsSync(chunk.target) && chunk.if.includes("no-file")) {
      newTargetContent = sourceContent;
      if (!preview) ensureFileSync(chunk.target);
    }

    // If pattern was not found
    else if (
      !singlePatternRegex.test(oldTargetContent) &&
      !doublePatternRegex.test(oldTargetContent) &&
      chunk.if.includes("no-pattern")
    ) {
      if (chunk.before || chunk.after) {
        // before or after a pattern
        const placementRegex = new RegExp(
          escapeRegExp(chunk.before ? chunk.before : chunk.after),
          "i"
        );
        if (placementRegex.test(oldTargetContent)) {
          newTargetContent = oldTargetContent.replace(
            placementRegex,
            chunk.before
              ? `${sourceContent}\n${chunk.before}`
              : `${chunk.after}\n${sourceContent}`
          );
        }
      }

      // add at the end of the file if no before/after or if before/after pattern not found
      if (newTargetContent === null) {
        newTargetContent =
          oldTargetContent
            .replace(/^(\r\n|\n|\r)+/, "")
            .replace(/(\r\n|\n|\r)+$/, "") +
          (/^(\r\n|\n|\r|\s)*$/.test(oldTargetContent) ? "" : "\n\n") +
          sourceContent;
      }
    }
    // double pattern
    else if (doublePatternRegex.test(oldTargetContent)) {
      if (chunk.if.includes("double-pattern") && this.forceInject === true)
        newTargetContent = oldTargetContent.replace(
          doublePatternRegex,
          sourceContent
        );
    }
    // single pattern
    else if (
      singlePatternRegex.test(oldTargetContent) &&
      chunk.if.includes("single-pattern")
    ) {
      newTargetContent = oldTargetContent.replace(
        singlePatternRegex,
        sourceContent
      );
    }

    if (newTargetContent === null) return false;
    else {
      if (!preview) writeFileSync(chunk.target, newTargetContent);
      return true;
    }
  }

  async replaceFiles(
    files: Array<string>,
    replacements: { [key: string]: string },
    filter: RegExp
  ) {
    return Promise.all(
      files.map(
        async (file) =>
          new Promise((resolve) => {
            if (filter.test(file)) {
              const content = readFileSync(file, "utf8");
              const newContent = this.replaceContent(content, replacements);
              writeFileSync(file, newContent);
            }
            resolve();
          })
      )
    );
  }

  replaceContent(
    content: string,
    replacements: { [key: string]: string },
    path = "",
    filter = /.*/i
  ): string {
    const pattern = new RegExp(
      Object.keys(replacements)
        .map((v) => escapeRegExp(v))
        .join("|"),
      "ig"
    );

    return !filter.test(path)
      ? content
      : content.replace(pattern, function (match) {
          return replacements[match] ? replacements[match] : "";
        });
  }

  chunkToString(chunk: ChunkLogType) {
    let msg = `${chunk.target} (${chunk.source})`;
    if (chunk.error) msg = msg + " " + chunk.error;
    return msg;
  }

  isAllowedDir(
    value: {
      path: string;
      type: string;
    },
    ignore: Array<string> = []
  ): boolean {
    return value.type === "tree" ? this.isAllowed(value.path, ignore) : false;
  }

  isAllowedFile(
    value: {
      path: string;
      type: string;
    },
    ignore: Array<string> = []
  ): boolean {
    return value.type === "blob" ? this.isAllowed(value.path, ignore) : false;
  }

  isAllowed(path: string, ignore: Array<string>): boolean {
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
