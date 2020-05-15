import { expect, test } from "@oclif/test";

import cmd = require("../src");

describe("neat", () => {
  test
    .stdout()
    .do(() => cmd.run([]))
    .it("runs without arguments", (ctx) => {
      expect(ctx.stdout).to.contain("USAGE");
    });

  test
    .stdout()
    .do(() => cmd.run(["repo"]))
    .it("runs without a folder argument", (ctx) => {
      expect(ctx.stdout).to.contain("Getting files from");
    });
});
