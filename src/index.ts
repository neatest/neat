import { Command, flags } from "@oclif/command";
import chalk from "chalk";
import { exec } from "child_process";
import cli from "cli-ux";
import { existsSync, mkdirSync, readFileSync } from "fs-extra";
import inquirer from "inquirer";
import { ChunkLogType, LocalFolder } from "./lib/LocalFolder";
import { NeatConfig } from "./lib/NeatConfig";
import {
  isQuestionChoiceType,
  isScriptCommandType,
  isString,
  QuestionChoiceType,
  ScriptCommandType,
} from "./lib/NeatConfigTypes";
import { RemoteRepo, TreeType } from "./lib/RemoteRepo";

class Neat extends Command {
  static description =
    "Download files from a remote GitHub repo to a local folder and eventually ask questions and run pre-defined commands.";

  static flags = {
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    only: flags.string({
      char: "o",
      description: `Only download remote file names matching the passed regex.`,
      exclusive: ["except"],
    }),
    except: flags.string({
      char: "e",
      description: `Any remote file name matching the passed regex will not be downloaded.`,
      exclusive: ["only"],
    }),
    "force-inject": flags.boolean({
      description: `Force replacing injections that already exist.`,
      exclusive: ["force"],
    }),
    "force-download": flags.boolean({
      description: `Force downloading and replacing files that already exist.`,
      exclusive: ["force"],
    }),
    force: flags.boolean({
      char: "f",
      description: `Force downloads and injections (same as combining --force-inject and --force-download)`,
      exclusive: ["force-inject", "force-download"],
    }),
    silent: flags.boolean({
      char: "s",
      description: `Don't ask for any user input.`,
    }),
    debug: flags.boolean({
      char: "d",
      description: `Used to help identify what went wrong when creating Neat config files`,
    }),
  };

  static args = [
    {
      name: "repository",
      description: `Repo to use as a template.
Use a name from the official neat-repos.yml file or a GitHub path like owner/repo
Also supports tags and branches such as neat-repo@v1 or owner/repo@master`,
    },
    {
      name: "folder",
      description: "Target folder. If it doesn't exist, it will be created.",
    },
  ];

  async run() {
    const { args, flags } = this.parse(Neat);

    if (flags.debug === true) process.env["NEAT_DEBUG"] = "true";

    if (!args.repository) return this._help();
    else if (args.repository === "inspect") return this.inspect(args.folder);

    if (args.folder) {
      if (!existsSync(args.folder)) mkdirSync(args.folder);
      process.chdir(args.folder);
    }

    // Get path if input was a neat repo
    const repository = args.repository.includes("/")
      ? args.repository
      : await RemoteRepo.getNeatRepoPath(args.repository).catch(this.error);

    // Show initialization message

    this.log(chalk.cyan(`Using https://github.com/${repository}`));

    // Initialize remote repository
    const remote = new RemoteRepo(repository);
    const tree = await remote.getTree().catch(this.error);

    // Initialize local folder
    const local = new LocalFolder(
      flags.force ? true : flags["force-download"],
      flags.force ? true : flags["force-inject"],
      flags.only,
      flags.except
    );

    // Get config
    const neatConfig = await remote.getConfig().catch(this.error);

    // Preview changes and ask for confirmation
    if (flags.silent !== true)
      await this.dryRun(tree, neatConfig, local).catch(this.error);

    // Run pre-run commands
    if (neatConfig.hasPreRun()) {
      this.log("Execute pre-run commands...");
      for (const command of neatConfig.preRun) {
        await this.execCommand(command);
      }
    }

    // Ask questions
    if (neatConfig.hasQuestions()) {
      if (flags.silent === true) {
        neatConfig.addReplacementsFromAnswers(
          neatConfig.getAnswersFromEnv(process.env)
        );
      } else
        await inquirer
          .prompt(neatConfig.getQuestions())
          .then((answers) => {
            neatConfig.addReplacementsFromAnswers(
              answers as { [key: string]: string }
            );
            neatConfig
              .getEnvFromAnswers(answers as { [key: string]: string })
              .forEach((env) => (process.env[env.name] = env.value));
          })
          .catch(this.error);
    }

    // Run pre-download commands
    if (neatConfig.hasPreDownload()) {
      this.log("Execute pre-download commands...");
      for (const command of neatConfig.preDownload) {
        await this.execCommand(command);
      }
    }

    // Download files
    const [
      addedFiles,
      skippedFiles,
      addedDirs,
      skippedDirs,
    ] = await local.downloadTree(tree, neatConfig.ignore).catch(this.error);

    // Log added files to console
    this.log(`${chalk.green("✔️")} ${addedFiles.length} file(s) added:`);
    if (addedFiles.length) this.log(chalk.grey(addedFiles.join("\n")));

    // Log skipped files to console
    if (skippedFiles.length) {
      this.log(`${chalk.red("x")} ${skippedFiles.length} file(s) skipped:`);
      this.log(chalk.grey(skippedFiles.join("\n")));
    }

    // Replace files
    if (neatConfig.hasReplace())
      await local
        .replaceFiles(
          addedFiles,
          neatConfig.replacements,
          neatConfig.replaceFilter
        )
        .catch(this.error);

    // Inject files
    let addedChunks: Array<ChunkLogType> = [];
    let skippedChunks: Array<ChunkLogType> = [];

    if (neatConfig.hasChunks()) {
      const injections = await local
        .injectChunks(
          neatConfig.chunks,
          false,
          addedFiles,
          neatConfig.replacements,
          neatConfig.replaceFilter
        )
        .catch(this.error);
      addedChunks = injections.addedChunks;
      skippedChunks = injections.skippedChunks;

      // Log added chunks to console
      this.log(`${chalk.green("✔️")} ${addedChunks.length} chunk(s) injected:`);
      if (addedChunks.length)
        this.log(
          chalk.grey(addedChunks.map(local.chunkToString).sort().join("\n"))
        );

      // Log skipped chunks to console
      if (skippedChunks.length) {
        this.log(`${chalk.red("x")} ${skippedChunks.length} chunk(s) skipped:`);
        this.log(
          chalk.grey(skippedChunks.map(local.chunkToString).sort().join("\n"))
        );
      }
    }

    // Run post-run commands
    if (neatConfig.hasPostRun()) {
      local
        .getEnvVars(
          addedFiles,
          skippedFiles,
          addedDirs,
          skippedDirs,
          addedChunks,
          skippedChunks
        )
        .forEach((env) => (process.env[env.name] = env.value));

      this.log("Execute post-run commands...");

      for (const command of neatConfig.postRun) {
        await this.execCommand(command);
      }
    }

    this.log(chalk.green("\n\nYour repo is ready!"));
  }

  async inspect(repo: string | undefined) {
    let repository: string;
    let config: NeatConfig;

    if (repo === undefined) this.error("You need to specify a repo to inspect");
    // If inspecting a local config file
    else if (/^\./i.test(repo)) {
      const path = repo.replace(/\/$/, "") + "/";
      if (!existsSync(`${path}/.neat.yml`))
        this.error(`Cannot find a config file at ${path}.neat.yml`);
      else {
        // Show initialization message
        this.log(chalk.cyan(`Inspecting ${path}.neat.yml`));

        // Get config
        config = new NeatConfig(
          readFileSync(`${path}.neat.yml`, "utf-8"),
          path
        );
      }
    }
    // If inspecting a remote repo
    else {
      repository = repo.includes("/")
        ? repo
        : await RemoteRepo.getNeatRepoPath(repo).catch(this.error);

      // Show initialization message
      this.log(chalk.cyan(`Inspecting https://github.com/${repository}`));

      // Initialize remote repository
      const remote = new RemoteRepo(repository);

      // Get config
      config = await remote.getConfig();
    }

    if (config.preRun || config.preDownload || config.postRun) {
      const stages: { [k: string]: Array<string | ScriptCommandType> } = {
        "pre-run": config.preRun,
        "pre-download": config.preDownload,
        "post-run": config.postRun,
      };
      Object.keys(stages).forEach((key) => {
        if (stages[key].length) {
          this.log(chalk.inverse(`\n${key}\n`));
          stages[key].map((v) =>
            isScriptCommandType(v)
              ? this.log(
                  `  - script: ${chalk.yellow(
                    /\n/.test(v.toString())
                      ? v.toString().replace(/^|\n/g, `\n    `)
                      : v.toString()
                  )}`
                )
              : this.log(`  - ${chalk.red(v.replace(/\n/g, "\n    "))}`)
          );
        }
      });
    }
    if (config.symLink.length) {
      this.log(`\n${chalk.inverse("symlink")}`);
      config.symLink.forEach((s) =>
        this.log(
          `\n  - ${chalk.green(s.target)}: ${chalk.greenBright(s.source)}`
        )
      );
    }
    if (config.ignore.length)
      this.log(
        `\n${chalk.inverse("ignore")} [${chalk.green(
          config.ignore.join(", ")
        )}]`
      );
    if (config.questions.length) {
      this.log(`\n${chalk.inverse("ask")}`);
      config.questions.forEach((q) => {
        this.log(`\n  - id: ${chalk.green(q.name)}`);
        this.log(`    description: ${chalk.green(q.message)}`);
        if (config.toReplace.includes(q.name))
          this.log(`    replace: ${chalk.green("true")}`);
        if (q.default) this.log(`    default: ${chalk.green(q.default)}`);
        else if (q.choices) {
          const choices: Array<string | QuestionChoiceType> = q.choices();
          if (choices.length > 0 && typeof choices[0] === "string")
            this.log(`    default: [${chalk.green(choices.join(", "))}]`);
          else if (choices.length > 0) {
            this.log(`    default:`);
            choices
              .filter(isQuestionChoiceType)
              .forEach((choice) =>
                this.log(
                  `      - ${chalk.green(choice.name)}: ${chalk.greenBright(
                    choice.checked
                  )}`
                )
              );
          }
        }
      });
    }
    if (config.chunks.length) {
      this.log(`\n${chalk.inverse("inject")}`);
      config.chunks.forEach((chunk) => {
        this.log(`\n  - id: ${chalk.green(chunk.id)}`);
        this.log(`    if: [${chalk.green(chunk.if.join(", "))}]`);
        this.log(`    wrap:`);
        this.log(
          `      before: ${chalk.green(
            chunk.wrap.before.replace(/\n/g, "\\n")
          )}`
        );
        this.log(
          `      after: ${chalk.green(chunk.wrap.after.replace(/\n/g, "\\n"))}`
        );
        if (chunk.command) this.log(`    command: ${chalk.red(chunk.command)}`);

        const stringprops: Array<
          "target" | "pattern" | "file" | "url" | "before" | "after"
        > = ["target", "pattern", "file", "url", "before", "after"];

        stringprops.forEach((v) => {
          if (chunk[v]) this.log(`    ${v}: ${chalk.green(chunk[v])}`);
        });
      });
    }
    if (config.replacePattern)
      this.log(
        `\n${chalk.inverse("replace_pattern")} ${chalk.green(
          config.replacePattern
        )}`
      );
    if (config.replaceFilter)
      this.log(
        `\n${chalk.inverse("replace_filter")} ${chalk.green(
          config.replaceFilter
        )}`
      );
  }

  async dryRun(tree: TreeType[], neatConfig: NeatConfig, local: LocalFolder) {
    // Get files that will be downloaded
    const [filesToAdd] = await local.downloadTree(
      tree,
      neatConfig.ignore,
      true
    );

    // Get chunks that will be injected
    let chunksToAdd: Array<ChunkLogType> = [];
    let chunksUnknown: Array<ChunkLogType> = [];
    if (neatConfig.hasChunks()) {
      const injections = await local
        .injectChunks(neatConfig.chunks, true, filesToAdd)
        .catch(this.error);
      chunksToAdd = injections.addedChunks;
      chunksUnknown = injections.unknownChunks;
    }

    // If nothing to do, skip any user input
    if (
      !neatConfig.preRun.length &&
      !filesToAdd.length &&
      !chunksToAdd.length &&
      !chunksUnknown.length &&
      !neatConfig.postRun.length
    ) {
      return false;
    } else {
      // Preview pre-run commands
      if (neatConfig.hasPreRun()) {
        this.log(
          chalk.yellow(
            `⚠️ ${chalk.bold(
              neatConfig.preRun.length
            )} command(s) will be run before processing:`
          )
        );
        neatConfig.preRun.map((command) => this.log(chalk.grey(command)));
      }

      // Preview pre-download commands
      if (neatConfig.hasPreDownload()) {
        this.log(
          chalk.yellow(
            `⚠️ ${chalk.bold(
              neatConfig.preDownload.length
            )} command(s) will be run before downloading files:`
          )
        );
        neatConfig.preDownload.map((command) => this.log(chalk.grey(command)));
      }

      // Preview post-run commands
      if (neatConfig.hasPostRun()) {
        this.log(
          chalk.yellow(
            `⚠️ ${chalk.bold(
              neatConfig.postRun.length
            )} command(s) will be run after processing:`
          )
        );
        neatConfig.postRun.map((command) => this.log(chalk.grey(command)));
      }

      // Preview files to add
      this.log(
        `${chalk.yellow("⚠️")} ${chalk.bold(
          filesToAdd.length
        )} file(s) will be added:`
      );
      if (filesToAdd.length) this.log(chalk.grey(filesToAdd.join("\n")));

      // Preview chunks to add
      if (neatConfig.hasChunks()) {
        this.log(
          `${chalk.yellow("⚠️")} ${chalk.bold(
            chunksToAdd.length
          )} chunk(s) will be injected:`
        );
        if (chunksToAdd.length)
          this.log(
            chalk.grey(chunksToAdd.map(local.chunkToString).sort().join("\n"))
          );

        if (chunksUnknown.length) {
          this.log(
            `${chalk.yellow("⚠️")} ${chalk.bold(
              chunksUnknown.length
            )} chunk(s) will be known after apply:`
          );
          this.log(
            chalk.grey(chunksUnknown.map(local.chunkToString).sort().join("\n"))
          );
        }
      }

      // Ask for confirmation to proceed
      await cli.anykey();
    }
    return true;
  }

  // Function to execute pre/post/pre-download run commands
  async execCommand(command: string | ScriptCommandType) {
    // If Javascript
    if (isScriptCommandType(command)) {
      cli.action.start(`Running script command`);
      const evalOutput = eval(`var fs = require('fs');\n ${command.script}`);
      this.log(evalOutput as string);
      cli.action.stop(chalk.green("✔️ done"));
    }

    // Other commands
    else if (isString(command)) {
      return new Promise(async (resolve) => {
        cli.action.start(`Running ${chalk.grey(command)}`);
        const output = exec(command, { env: process.env }, resolve);
        if (output != null) {
          if (output.stdout != null) output.stdout.on("data", this.log);
          if (output.stderr != null)
            output.stderr.on("data", (d) => this.log(chalk.red(d)));
          output.on("close", () => cli.action.stop(chalk.green("✔️ done")));
        }
      });
    }
  }
}

export = Neat;
