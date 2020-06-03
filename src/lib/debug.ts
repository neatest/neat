import chalk from "chalk";

/* eslint-disable no-console */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debug(title: string, value: any) {
  if (process.env["NEAT_DEBUG"] === "true") {
    console.log(chalk.inverse.bold(`\n======== Begin ${title} ========`));
    console.log(value);
    console.log(chalk.inverse.bold(`========= End ${title} =========\n`));
  }
}
