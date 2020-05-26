import { Command, flags } from "@oclif/command";
import chalk from "chalk";
import { exec as syncExec } from "child_process";
import cli from "cli-ux";
import inquirer from "inquirer";
import { format, promisify } from "util";
import { ChunkLogType, LocalFolder } from "./lib/LocalFolder";
import { NeatConfig } from "./lib/NeatConfig";
import { RemoteRepo, TreeType } from "./lib/RemoteRepo";

const exec = promisify(syncExec);

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
    let envVars: { [key: string]: string } = {};
    if (!args.repository) return this._help();

    // Get path if input was a neat repo
    const repository = args.repository.includes("/")
      ? args.repository
      : await RemoteRepo.getNeatRepoPath(args.repository).catch(this.error);

    // Show initialization message
    this.log(`Using https://github.com/${chalk.cyan(repository)}`);

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
      await Promise.all(
        neatConfig.preRun.map(
          async (command: string) => await this.execCommand(command)
        )
      ).catch(this.error);
    }

    // Download files
    const [
      addedFiles,
      skippedFiles,
      addedDirs,
      skippedDirs,
    ] = await local.downloadTree(tree, neatConfig.ignore).catch(this.error);

    // Log added files to console
    this.logGreen(`Files added: ${addedFiles.length}`);
    if (addedFiles.length) addedFiles.join("\n");

    // Log skipped files to console
    this.logYellow(`Files skipped: ${skippedFiles.length}`);
    if (skippedFiles.length) this.log(skippedFiles.join("\n"));

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
        .injectChunks(neatConfig.chunks, neatConfig.ignore)
        .catch(this.error);

      // Log added chunks to console
      this.logGreen(`Chunks injected: ${addedChunks.length}`);
      if (addedChunks.length)
        this.log(addedChunks.map(local.chunkToString).sort().join("\n"));

      // Log skipped chunks to console
      this.logYellow(`Chunks skipped: ${skippedChunks.length}`);
      if (skippedChunks.length)
        this.log(skippedChunks.map(local.chunkToString).sort().join("\n"));
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

      await Promise.all(
        neatConfig.postRun.map((command: string) =>
          this.execCommand(command, { env: envVars })
        )
      ).catch(this.error);
    }
  }

  // Function to execute pre/post run commands
  async execCommand(command: string, env = {}) {
    const { stdout, stderr } = await exec(command, env);
    if (stderr) this.error(stderr);
    else this.log(format("%s\n%s", chalk.grey(command), stdout));
  }

  logGreen(text: string) {
    return this.log(chalk.green(text));
  }

  logYellow(text: string) {
    return this.log(chalk.yellow(text));
  }

  logRed(text: string) {
    return this.log(chalk.red(text));
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
        .injectChunks(neatConfig.chunks, neatConfig.ignore, true)
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
      if (neatConfig.hasPreRun()) {
        // Preview pre-run commands
        this.logRed(
          `Commands to be run before processing: ${neatConfig.preRun.length}`
        );
        neatConfig.preRun.map((command) => this.log(command));
      }

      // Preview post-run commands
      if (neatConfig.hasPostRun()) {
        this.logRed(
          `Commands to be run after processing: ${neatConfig.postRun.length}`
        );
        neatConfig.postRun.map((command) => this.log(command));
      }

      // Preview files to add
      this.logGreen(`Files to be added: ${filesToAdd.length}`);
      if (filesToAdd.length) this.log(filesToAdd.join("\n"));

      // Preview chunks to add
      if (neatConfig.hasChunks())
        this.logGreen(`Chunks to be injected: ${chunksToAdd.length}`);
      if (chunksToAdd.length)
        this.log(chunksToAdd.map(local.chunkToString).sort().join("\n"));

      // Ask for confirmation to proceed
      await cli.anykey();
    }
    return true;
  }
}

export = Neat;
