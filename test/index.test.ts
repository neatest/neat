/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/camelcase */
import { expect, test } from "@oclif/test";
import { existsSync, readFileSync, removeSync } from "fs-extra";
import nock from "nock";
const mockInquirer = require("mock-inquirer");

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
    .reply(200, { repo: "test/test" })
    .get(/test\.(md|txt|html)?$/)
    .reply(200, testContent);
});

describe("COMMANDS", () => {
  beforeEach(function () {
    nock("https://raw.githubusercontent.com")
      .persist()
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

  describe("neat repo", () => {
    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs without a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
        expect(existsSync("test/test.md")).to.be.true;
        expect(existsSync("test/test.txt")).to.be.true;
        expect(existsSync("test/test.html")).to.be.true;
        expect(readFileSync("test/test.md", "utf-8")).to.equal(testContent);
        expect(readFileSync("test/test.txt", "utf-8")).to.equal(testContent);
        expect(readFileSync("test/test.html", "utf-8")).to.equal(testContent);
      });

    test
      .stdout()
      .do(() => cmd.run(["repo", "test/testing"]))
      .it("runs with a folder argument", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
        expect(existsSync("test/testing/test/test.md")).to.be.true;
        expect(existsSync("test/testing/test/test.txt")).to.be.true;
        expect(existsSync("test/testing/test/test.html")).to.be.true;
        expect(readFileSync("test/testing/test/test.md", "utf-8")).to.equal(
          testContent
        );
        expect(readFileSync("test/testing/test/test.txt", "utf-8")).to.equal(
          testContent
        );
        expect(readFileSync("test/testing/test/test.html", "utf-8")).to.equal(
          testContent
        );
      });

    test
      .stdout()
      .do(() => cmd.run(["test/test"]))
      .it("runs with any repo", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });

    test
      .stdout()
      .do(() => cmd.run(["test/test@v1"]))
      .it("runs with any branch", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });

    test
      .do(() => cmd.run(["test2"]))
      .catch((ctx) => {
        expect(ctx.message).to.contain("Cannot find this repo in the list");
      })
      .it("fails when a neat repo cannot be found");
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

  describe("neat --silent", () => {
    beforeEach(function () {
      nock("https://raw.githubusercontent.com")
        .get("/test/test/master/.neat.yml")
        .replyWithFile(200, "examples/ask/.neat.yml");
    });

    test
      .stdout()
      .do(() => cmd.run(["repo", "--silent"]))
      .it("runs without asking for user input when silent is set", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 3");
      });
  });

  describe("neat --only", () => {
    test
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
      .it("runs ignoring markdown files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 2");
      });

    test
      .stdout()
      .do(() => cmd.run(["repo", "--except", ".(md|txt)$"]))
      .it("runs ignoring markdown and text files", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 1");
      });
  });
});

describe("CONFIG", () => {
  beforeEach(function () {
    mockInquirer([
      {
        project_name: "hello world",
        ci: "Travis",
        options: ["Code Coverage", "PR template"],
        support_url: "https://test.com",
      },
    ]);
  });

  describe("pre-run", () => {
    beforeEach(function () {
      nock("https://raw.githubusercontent.com")
        .get("/test/test/master/.neat.yml")
        .replyWithFile(200, "examples/pre-run/.neat.yml");
    });

    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs when pre-run commands are specified", (ctx) => {
        expect(ctx.stdout).to.contain("hello world");
      });
  });

  describe("post-run", () => {
    beforeEach(function () {
      nock("https://raw.githubusercontent.com")
        .get("/test/test/master/.neat.yml")
        .replyWithFile(200, "examples/post-run/.neat.yml");
    });

    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs when post-run commands are specified", (ctx) => {
        expect(ctx.stdout).to.contain("goodbye world");
      });
  });

  describe("ignore", () => {
    beforeEach(function () {
      nock("https://raw.githubusercontent.com")
        .get("/test/test/master/.neat.yml")
        .replyWithFile(200, "examples/ignore/.neat.yml");
    });

    test
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("does not download certain files when ignore is specified", (ctx) => {
        expect(ctx.stdout).to.contain("Files added: 2");
      });
  });

  describe("ask", () => {
    test
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask/.neat.yml");
      })
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs when questions are specified", (ctx) => {
        expect(ctx.stdout)
          .to.contain("echo $NEAT_ASK_PROJECT_NAME\nhello world")
          .and.to.contain("echo $NEAT_ASK_CI\nTravis")
          .and.to.contain("echo $NEAT_ASK_OPTIONS\nCode Coverage, PR template");
      });

    test
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask-replace/.neat.yml");
      })
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs with replace", () => {
        const newTestContent = testContent
          .replace("{{project_name}}", "hello world")
          .replace("{{ci}}", "Travis")
          .replace("{{options}}", "Code Coverage, PR template")
          .replace("{{support_url}}", "https://test.com");

        expect(existsSync("test/test.md")).to.be.true;
        expect(readFileSync("test/test.md", "utf-8")).to.equal(newTestContent);
        expect(existsSync("test/test.txt")).to.be.true;
        expect(readFileSync("test/test.txt", "utf-8")).to.equal(newTestContent);
        expect(existsSync("test/test.html")).to.be.true;
        expect(readFileSync("test/test.html", "utf-8")).to.equal(
          newTestContent
        );
      });

    test
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask-replace-options/.neat.yml");
      })
      .stdout()
      .do(() => cmd.run(["repo"]))
      .it("runs with replace pattern and filter options", () => {
        const newTestContent = testContent.replace(
          "<!-- project_name -->",
          "hello world"
        );

        expect(existsSync("test/test.md")).to.be.true;
        expect(readFileSync("test/test.md", "utf-8")).to.equal(newTestContent);
        expect(existsSync("test/test.txt")).to.be.true;
        expect(readFileSync("test/test.txt", "utf-8")).to.equal(testContent);
        expect(existsSync("test/test.html")).to.be.true;
        expect(readFileSync("test/test.html", "utf-8")).to.equal(testContent);
      });
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
