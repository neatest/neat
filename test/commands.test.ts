/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/camelcase */
import { expect, test } from "@oclif/test";
import { cli } from "cli-ux";
import { existsSync, removeSync } from "fs-extra";
import nock from "nock";
import { expectFilesContentToMatch, testContent } from "./testHelpers";

import cmd = require("../src");

describe("COMMANDS", () => {
  beforeEach(function () {
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
      .reply(200, { test: "test/test" })
      .get(/test\.(md|txt|html)?$/)
      .reply(200, testContent)
      .get(/(master|v1)\/\.neat\.yml$/)
      .reply(404);
  });

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

  describe("neat test", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs without a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch();
      });

    const folder = "test/testing/";
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", folder]))
      .it("runs with a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch(folder);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test/test"]))
      .it("runs with any repo", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test/test@v1"]))
      .it("runs with any branch", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test2"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Cannot find this repo in the list");
      })
      .it("fails when a neat repo cannot be found");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .do(() => nock.cleanAll())
      .nock("https://api.github.com/repos/doesnot/exist/git/trees", (nock) => {
        nock.get("/master?recursive=1").reply(404, {
          message: "Not Found",
          documentation_url:
            "https://developer.github.com/v3/git/trees/#get-a-tree",
        });
      })
      .stdout()
      .do(() => cmd.run(["doesnot/exist"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Not Found");
      })
      .it("fails when a public repo cannot be found");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://api.github.com/repos/test/test/git/trees", (nock) => {
        nock.get("/empty?recursive=1").reply(200, { tree: [] });
      })
      .nock("https://raw.githubusercontent.com/test/test/empty", (nock) => {
        nock.get("/.neat.yml").reply(404);
      })
      .stdout()
      .do(() => cmd.run(["test/test@empty"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("test/test@empty is empty");
      })
      .it("fails when a repo doesn't contain anything");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .do(() => nock.cleanAll())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock.get("/olivr-com/neat/master/neat-repos.json").reply(500);
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Internal Server Error");
      })
      .it("fails when there is a problem to fetch the neat repos list");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["re$po"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("This is no a valid repo name");
      })
      .it("fails when the neat repo name is not valid");
  });

  describe("neat --debug", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--debug"]))
      .it("outputs debug information", (ctx) => {
        expect(ctx.stdout).to.contain("Begin parsed YAML configuration");
      });
  });

  describe("neat --force", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("skips file(s) when force is not set", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) skipped");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .stdout()
      .do(() => cmd.run(["test", "--force"]))
      .it("overwrites file(s) if force is set", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .stdout()
      .do(() => cmd.run(["test", "--force-download"]))
      .it("overwrites file(s) if force-download is set", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) added");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test"]))
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--force-inject"]))
      .it("skips file(s) when only force-inject is set", (ctx) => {
        expect(ctx.stdout).to.contain("3 file(s) skipped");
        expectFilesContentToMatch();
      });
  });

  describe("neat --only", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stderr()
      .do(() => cmd.run(["test", "--only"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Flag --only expects a value");
      })
      .it("fails if only is set with an empty value");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--only", ".md$"]))
      .it("runs only for markdown files", (ctx) => {
        expect(ctx.stdout).to.contain("1 file(s) added");
        expectFilesContentToMatch("./", ["test/test.md"]);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--only", ".(md|txt)$"]))
      .it("runs only for markdown and text files", (ctx) => {
        expect(ctx.stdout).to.contain("2 file(s) added");
        expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
      });
  });

  describe("neat --except", () => {
    test
      .stderr()
      .do(() => cmd.run(["test", "--except"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Flag --except expects a value");
      })
      .it("fails if except is set with an empty value");

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--except", ".md$"]))
      .it("runs ignoring markdown files", (ctx) => {
        expect(ctx.stdout).to.contain("2 file(s) added");
        expectFilesContentToMatch("./", ["test/test.txt", "test/test.html"]);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .stdout()
      .do(() => cmd.run(["test", "--except", ".(md|txt)$"]))
      .it("runs ignoring markdown and text files", (ctx) => {
        expect(ctx.stdout).to.contain("1 file(s) added");
        expectFilesContentToMatch("./", ["test/test.html"]);
      });
  });

  afterEach(() => {
    ["test/test.txt", "test/test.md", "test/test.html", "test/testing"].map(
      (file) => {
        if (existsSync(file)) removeSync(file);
      }
    );
    nock.cleanAll();
  });
});
