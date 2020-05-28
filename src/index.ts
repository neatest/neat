import { Command, flags } from "@oclif/command";
import chalk from "chalk";
import { exec } from "child_process";
import cli from "cli-ux";
import { existsSync, mkdirSync } from "fs-extra";
import inquirer from "inquirer";
import { ChunkLogType, LocalFolder } from "./lib/LocalFolder";
import { NeatConfig } from "./lib/NeatConfig";
import { RemoteRepo, TreeType } from "./lib/RemoteRepo";

// ${chalk.green("✔️")}
// ${chalk.yellow("⚠️")}
// ${chalk.red("x")}

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
      default: "./",
    },
  ];

  async run() {
    const { args, flags } = this.parse(Neat);
    let envVars = process.env;
    if (!args.repository) return this._help();

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
      args.folder,
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
        await this.execCommand(command, args.folder, envVars);
      }
    }

    // Ask questions
    if (neatConfig.hasQuestions()) {
      const answers =
        flags.silent === true
          ? neatConfig.getAnswersFromVars()
          : ((await inquirer
              .prompt(neatConfig.questions)
              .catch(this.error)) as { [key: string]: string });

      neatConfig.addReplacementsFromAnswers(answers);
      const envAskVars = neatConfig.getEnvFromAnswers(answers);

      envVars = { ...envVars, ...envAskVars };
    }

    // Run pre-download commands
    if (neatConfig.hasPreDownload()) {
      this.log("Execute pre-download commands...");
      for (const command of neatConfig.preDownload) {
        await this.execCommand(command, args.folder, envVars);
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
      [addedChunks, skippedChunks] = await local
        .injectChunks(
          neatConfig.chunks,
          false,
          neatConfig.replacements,
          neatConfig.replaceFilter
        )
        .catch(this.error);

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
      envVars = {
        ...envVars,
        ...local.getEnvVars(
          addedFiles,
          skippedFiles,
          addedDirs,
          skippedDirs,
          addedChunks,
          skippedChunks
        ),
      };

      this.log("Execute post-run commands...");

      for (const command of neatConfig.postRun) {
        await this.execCommand(command, args.folder, envVars);
      }
    }

    this.log(chalk.green("Your repo is ready!"));
  }

  // Function to execute pre/post run commands
  async execCommand(command: string, folder: string, env = {}) {
    if (!existsSync(folder)) mkdirSync(folder);
    return new Promise((resolve) => {
      cli.action.start(command);
      const output = exec(
        command,
        {
          env: env,
          cwd: folder,
        },
        resolve
      );
      if (output != null) {
        if (output.stdout != null) output.stdout.on("data", this.log);
        if (output.stderr != null)
          output.stderr.on("data", (d) => this.log(chalk.red(d)));
        output.on("close", () => cli.action.stop(chalk.green("✔️")));
      }
    });
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
    if (neatConfig.hasChunks()) {
      [chunksToAdd] = await local
        .injectChunks(neatConfig.chunks, true)
        .catch(this.error);
    }

    // If nothing to do, skip any user input
    if (
      !neatConfig.preRun.length &&
      !filesToAdd.length &&
      !chunksToAdd.length &&
      !neatConfig.postRun.length
    ) {
      return false;
    } else {
      // Preview pre-run commands
      if (neatConfig.hasPreRun()) {
        this.log(
          `${chalk.yellow("⚠️")} ${chalk.bold(
            neatConfig.preRun.length
          )} command(s) will be run before processing:`
        );
        neatConfig.preRun.map((command) => this.log(chalk.grey(command)));
      }

      // Preview pre-download commands
      if (neatConfig.hasPreDownload()) {
        this.log(
          `${chalk.yellow("⚠️")} ${chalk.bold(
            neatConfig.preDownload.length
          )} command(s) will be run before downloading files:`
        );
        neatConfig.preDownload.map((command) => this.log(chalk.grey(command)));
      }

      // Preview post-run commands
      if (neatConfig.hasPostRun()) {
        this.log(
          `${chalk.yellow("⚠️")} ${chalk.bold(
            neatConfig.postRun.length
          )} command(s) will be run after processing:`
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
      if (neatConfig.hasChunks())
        this.log(
          `${chalk.yellow("⚠️")} ${chalk.bold(
            chunksToAdd.length
          )} chunk(s) will be injected:`
        );
      if (chunksToAdd.length)
        this.log(
          chalk.grey(chunksToAdd.map(local.chunkToString).sort().join("\n"))
        );

      // Ask for confirmation to proceed
      await cli.anykey();
    }
    return true;
  }
}

export = Neat;
