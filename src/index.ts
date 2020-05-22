import { Command, flags } from "@oclif/command";
import chalk from "chalk";
import cli from "cli-ux";
import inquirer, { Answers } from "inquirer";
import { format, promisify } from "util";
import { Repo } from "./lib/Repo";

const exec = promisify(require("child_process").exec);

class Neat extends Command {
  static description =
    "Download files from a remote GitHub repo to a local folder and eventually ask questions and run pre-defined commands.";

  static flags = {
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    only: flags.string({
      char: "o",
      description: `Only download remote file names matching the passed regex.
Note: if the matched files must always be downloaded, use in conjunction with --force`,
      exclusive: ["except"],
    }),
    except: flags.string({
      char: "e",
      description: `Any remote file name matching the passed regex will not be downloaded.`,
      exclusive: ["only"],
    }),
    force: flags.boolean({
      char: "f",
      description: `Overwrite all local files with their remote counterparts.
If this flag is not used, Neat will ignore remote files that exist locally.`,
    }),
    debug: flags.boolean({
      char: "d",
      description: `Display each file that was added / skipped.`,
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
      : await Repo.getNeatRepoPath(args.repository).catch(this.error);

    // Show initialization message
    this.log(`Getting files from ${chalk.cyan(repository)}`);
    //cli.action.start("Loading");

    // Initialize repo object
    const repo = new Repo(
      repository,
      args.folder,
      flags.force,
      flags.only,
      flags.except
    );

    // Get config object
    const neatConfig = await repo.getConfig();

    // Run pre-run commands
    if (neatConfig.hasPreRun()) {
      await Promise.all(
        neatConfig.preRun.map(
          async (command: string) => await this.execCommand(command)
        )
      );
    }

    // Ask questions
    if (neatConfig.hasQuestions()) {
      cli.action.stop("");
      envVars = {
        ...envVars,
        ...(await inquirer
          .prompt(neatConfig.questions)
          .then((answers: Answers) => {
            neatConfig.addReplacementsFromAnswers(answers);
            return neatConfig.getEnvFromAnswers(answers);
          })
          .catch(this.error)),
      };
    }

    // Download files
    await repo.downloadFiles().catch(this.error);

    // Replace files
    if (neatConfig.hasReplace())
      await repo
        .replaceFiles(neatConfig.replacements, neatConfig.replaceFilter)
        .catch(this.error);

    // Log added files to console
    this.log(chalk.green(`Files added: ${repo.added_files.length}`));
    if (flags.debug && repo.hasAddedFiles())
      this.log(repo.added_files.join("\n"));

    // Log skipped files to console
    this.log(chalk.yellow(`Files skipped: ${repo.skipped_files.length}`));
    if (flags.debug && repo.hasSkippedFiles())
      this.log(repo.skipped_files.join("\n"));

    // Run post-run commands
    if (neatConfig.hasPostRun()) {
      envVars.NEAT_ALL_FILES_DIRS = repo.getAllFilesAndDirs();
      envVars.NEAT_ADDED_FILES_DIRS = repo.getAddedFilesAndDirs();
      envVars.NEAT_SKIPPED_FILES_DIRS = repo.getSkippedFilesAndDirs();
      envVars.NEAT_ALL_FILES = repo.getAllFiles();
      envVars.NEAT_ADDED_FILES = repo.getAddedFiles();
      envVars.NEAT_SKIPPED_FILES = repo.getSkippedFiles();
      envVars.NEAT_ALL_DIRS = repo.getAllDirs();
      envVars.NEAT_ADDED_DIRS = repo.getAddedDirs();
      envVars.NEAT_SKIPPED_DIRS = repo.getSkippedDirs();

      await Promise.all(
        neatConfig.postRun.map((command: string) =>
          this.execCommand(command, { env: envVars })
        )
      );
    }
  }

  // Function to execute pre/post run commands
  async execCommand(command: string, env = {}) {
    const { stdout, stderr } = await exec(command, env);
    if (stderr) this.error(stderr);
    else this.log(format("%s\n%s", chalk.grey(command), stdout));
  }
}

export = Neat;
