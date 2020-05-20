import { expect, test } from "@oclif/test";
import { ensureFileSync, existsSync, removeSync } from "fs-extra";
import nock from "nock";

import cmd = require("../src");

const testContent = `
# {{project_name}}
Welcome to <!-- project_name -->

## Options
{{options}}

## CI
{{ci}}

## Support
[Get Support]({{support_url}})
`;

nock("https://api.github.com/repos/test/test/git/trees")
  .persist()
  .get(/\/(master|v1)\?recursive=1/)
  .reply(200, {
    tree: [
      { path: "test", type: "tree" },
      { path: "test/test.md", type: "blob" },
      { path: "test/test.txt", type: "blob" },
      { path: "test/test.html", type: "blob" },
    ],
  });

nock("https://raw.githubusercontent.com")
  .persist()
  .get("/olivr-com/neat/master/neat-repos.json")
  .reply(200, { repo: "test/test" })
  .get(/test\.(md|txt|html)?$/)
  .reply(200, testContent)
  .get(/(master|v1)\/\.neat\.yml$/)
  .reply(404);

describe("COMMANDS", () => {
  describe("neat --help", () => {
    test
      .stdout()
      .do(() => cmd.run(["--help"]))
      .exit(0)
      .it("displays help when run with the help flag", (ctx) => {
        expect(ctx.stdout).to.contain("USAGE");
      });

    test
      .stdout()
      .do(() => cmd.run([]))
      .exit(0)
      .it("displays help when run with no arguments", (ctx) => {
        expect(ctx.stdout).to.contain("USAGE");
      });
  });

  describe("neat repo", () => {
    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs without a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });

    test
      .stdout()
      .do(() => cmd.run(["repo", "test/testing"]))
      .it("runs with a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });

    test
      .stdout()
      .do(() => cmd.run(["test/test", "-d"]))
      .it("runs with any repo", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });
  });

  describe("neat --force", () => {
    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .stdout()
      .do(() => cmd.run(["repo", "--force"]))
      .it("overwrites files if force is set", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });

    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("skips files when force is not set", (ctx) => {
        expect(ctx.stdout).to.contain("Files skipped: 3");
      });
  });

  describe("neat --debug", () => {
    test
      .do(() => ensureFileSync("./test/test.md"))
      .stdout()
      .do(() => cmd.run(["repo", "--debug"]))
      .it("shows files if debug is set", (ctx) => {
        expect(ctx.stdout).to.contain(`Files added: 2
./test/test.txt
./test/test.html
Files skipped: 1
./test/test.md
`);
      });
  });

  describe("neat --only", () => {
    test
      .stderr()
      .do(() => cmd.run(["repo", "--only"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Flag --only expects a value");
      })
      .it("fails if only is set with an empty value");

    test
      .stdout()
      .do(() => cmd.run(["repo", "--only", ".md$"]))
      .it("runs only for markdown files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 1");
      });

    test
      .stdout()
      .do(() => cmd.run(["repo", "--only", ".(md|txt)$"]))
      .it("runs only for markdown and text files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 2");
      });
  });

  describe("neat --except", () => {
    test
      .stderr()
      .do(() => cmd.run(["repo", "--except"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Flag --except expects a value");
      })
      .it("fails if except is set with an empty value");

    test
      .stdout()
      .do(() => cmd.run(["repo", "--except", ".md$"]))
      .it("runs except for markdown files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 2");
      });

    test
      .stdout()
      .do(() => cmd.run(["repo", "--except", ".(md|txt)$"]))
      .it("runs except for markdown and text files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 1");
      });
  });
});

afterEach(() => {
  ["test/test.txt", "test/test.md", "test/test.html", "test/testing"].map(
    (file) => {
      if (existsSync(file)) removeSync(file);
    }
  );
});
