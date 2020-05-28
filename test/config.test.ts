/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/camelcase */
import { expect, test } from "@oclif/test";
import { cli } from "cli-ux";
import { existsSync, removeSync } from "fs-extra";
import nock from "nock";
import { stub } from "sinon";
import { expectFilesContentToMatch, testContent } from "./testHelpers";

const mockInquirer = require("mock-inquirer");

stub(cli.action, "start");

import cmd = require("../src");

describe("CONFIG", () => {
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
      .reply(200, testContent);

    mockInquirer([
      {
        proceed: true,
        project_name: "hello world",
        ci: "Travis",
        options: ["Code Coverage", "PR template"],
        support_url: "https://test.com",
      },
    ]);
  });

  /**
   * pre-run
   */
  describe("pre-run", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/pre-run/.neat.yml");
      })
      .stderr()
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs when pre-run commands are specified", (ctx) => {
        expect(ctx.stdout).to.contain("hello world");
        expectFilesContentToMatch();
      });
  });

  /**
   * symlink
   */
  describe("symlink", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/symlink/.neat.yml");
      })
      .stderr()
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs when symlinks are specified", (ctx) => {
        expect(ctx.stdout).to.contain("2 file(s) added");
        expectFilesContentToMatch("./", ["test/test.html", "test/test.md"]);
      });
  });

  /**
   * pre-download
   */
  describe("pre-download", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/pre-download/.neat.yml");
      })
      .stderr()
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs when pre-download commands are specified", (ctx) => {
        expect(ctx.stdout).to.contain("hello world");
        expectFilesContentToMatch();
      });
  });

  /**
   * post-run
   */
  describe("post-run", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/post-run/.neat.yml");
      })
      .stderr()
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs when post-run commands are specified", (ctx) => {
        expect(ctx.stdout).to.contain("goodbye world");
        expectFilesContentToMatch();
      });
  });

  /**
   * ignore
   */
  describe("ignore", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ignore/.neat.yml");
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "does not download certain file(s) when ignore is specified",
        (ctx) => {
          expect(ctx.stdout).to.contain("2 file(s) added");
          expectFilesContentToMatch("./", ["test/test.html", "test/test.txt"]);
        }
      );

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://api.github.com/repos/test/test/git/trees", (nock) => {
        nock.get("/ignore?recursive=1").reply(200, {
          tree: [
            { path: "test", type: "tree" },
            { path: "test/test.md", type: "blob" },
            { path: "test/test.txt", type: "blob" },
            { path: "test/test.html", type: "blob" },
            { path: "test/hello/test.html", type: "blob" },
          ],
        });
      })
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/ignore/.neat.yml")
          .reply(200, "ignore: [test/hello]");
      })
      .stdout()
      .do(() => cmd.run(["test@ignore"]))
      .it(
        "does not download certain file(s) when they are in an ignored folder",
        (ctx) => {
          expect(ctx.stdout).to.contain("3 file(s) added");
        }
      );
  });

  /**
   * ask
   */
  describe("ask", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask/.neat.yml");
      })
      .stdout()
      .stderr()
      .do(() => cmd.run(["test"]))
      .it("runs when questions are specified", (ctx) => {
        expect(ctx.stdout)
          .to.contain("hello world")
          .and.to.contain("Travis")
          .and.to.contain("Code Coverage, PR template");
        expectFilesContentToMatch();
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask-replace/.neat.yml");
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("runs with replace", () => {
        const newTestContent = testContent
          .replace("{{project_name}}", "hello world")
          .replace("{{ci}}", "Travis")
          .replace("{{options}}", "Code Coverage, PR template")
          .replace("{{support_url}}", "https://test.com");

        expectFilesContentToMatch(
          "./",
          ["test/test.md", "test/test.txt", "test/test.html"],
          newTestContent
        );
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask-replace-options/.neat.yml");
      })
      .stdout()
      .do(async (done) => cmd.run(["test"]).then(() => done))
      .it("runs with replace pattern and filter options", () => {
        const newTestContent = testContent.replace(
          "<!-- project_name -->",
          "hello world"
        );

        expectFilesContentToMatch("./", ["test/test.html", "test/test.txt"]);
        expectFilesContentToMatch("./", ["test/test.md"], newTestContent);
      });

    describe("--silent", () => {
      beforeEach(() => {
        nock("https://raw.githubusercontent.com")
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/ask-replace/.neat.yml");
      });

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .stdout()
        .env({
          NEAT_ASK_PROJECT_NAME: "hello world",
          NEAT_ASK_CI: "Travis",
          NEAT_ASK_OPTIONS: "Code Coverage, PR template",
          NEAT_ASK_SUPPORT_URL: "https://test.com",
        })
        .do(() => cmd.run(["test", "--silent"]))
        .it("runs without asking for user input when silent is set", () => {
          const newTestContent = testContent
            .replace(
              "{{project_name}}",
              process.env["NEAT_ASK_PROJECT_NAME"] as string
            )
            .replace("{{ci}}", process.env["NEAT_ASK_CI"] as string)
            .replace("{{options}}", process.env["NEAT_ASK_OPTIONS"] as string)
            .replace(
              "{{support_url}}",
              process.env["NEAT_ASK_SUPPORT_URL"] as string
            );

          expectFilesContentToMatch(
            "./",
            ["test/test.md", "test/test.txt", "test/test.html"],
            newTestContent
          );
        });

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .stdout()
        .do(() => cmd.run(["test", "--silent"]))
        .it(
          "runs with empty answers when silent is set and no environment variables were set",
          () => {
            const newTestContent = testContent
              .replace("{{project_name}}", "")
              .replace("{{ci}}", "")
              .replace("{{options}}", "")
              .replace("{{support_url}}", "");

            expectFilesContentToMatch(
              "./",
              ["test/test.md", "test/test.txt", "test/test.html"],
              newTestContent
            );
          }
        );
    });
  });

  /**
   * inject
   */
  describe("inject", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .replyWithFile(200, "examples/inject/.neat.yml");
      })
      .nock("https://test.com", (nock) => {
        nock
          .get("/content.html")
          .twice() // Because of dry-run using up one
          .reply(200, "<html>hello world</html>");
      })
      .stderr()
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("injects when no pattern is found", (ctx) => {
        expect(ctx.stdout)
          .to.contain("3 chunk(s) injected")
          .and.to.contain("3 file(s) added");

        const mdContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
        const txtContent = `${testContent}\n\n<!-- hello -->\n\nhello world\n\n<!-- hello -->`;
        const htmlContent = `${testContent}\n\n<!-- test -->\n\n<html>hello world</html>\n\n<!-- test -->`;
        expectFilesContentToMatch("./", ["test/test.md"], mdContent);
        expectFilesContentToMatch("./", ["test/test.txt"], txtContent);
        expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock.get("/test/test/master/.neat.yml").reply(
          200,
          `inject:
            - id: hello
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("injects when a single pattern is found", (ctx) => {
        expect(ctx.stdout)
          .to.contain("1 chunk(s) injected")
          .and.to.contain("3 file(s) added");

        const htmlContent = testContent.replace(
          "<!-- project_name -->",
          "<!-- project_name -->\n\nhello world\n\n<!-- project_name -->"
        );
        expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
        expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock
          .get("/test/test/master/.neat.yml")
          .twice()
          .replyWithFile(200, "examples/inject/.neat.yml");
      })
      .nock("https://test.com", (nock) => {
        nock
          .get("/content.html")
          .twice() // Because of dry-run using up one
          .reply(200, "<html>hello world</html>");
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("doesn't inject when a double pattern is found", (ctx) => {
        expect(ctx.stdout)
          .to.contain("3 chunk(s) skipped")
          .and.to.contain("3 file(s) skipped");

        const mdContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
        const txtContent = `${testContent}\n\n<!-- hello -->\n\nhello world\n\n<!-- hello -->`;
        const htmlContent = `${testContent}\n\n<!-- test -->\n\n<html>hello world</html>\n\n<!-- test -->`;
        expectFilesContentToMatch("./", ["test/test.md"], mdContent);
        expectFilesContentToMatch("./", ["test/test.txt"], txtContent);
        expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
      });

    describe("--force", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").twice().reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force"]))
        .it(
          "injects when double pattern exists already and force is set",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("1 chunk(s) injected")
              .and.to.contain("3 file(s) added");

            const htmlContent = testContent.replace(
              "<!-- project_name -->",
              "<!-- project_name -->\n\nhello world\n\n<!-- project_name -->"
            );
            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
          }
        );

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock
            .get("/test/test/master/.neat.yml")
            .twice()
            .replyWithFile(200, "examples/inject/.neat.yml");
        })
        .nock("https://test.com", (nock) => {
          nock
            .get("/content.html")
            .times(4) // Because of dry-run using up two
            .reply(200, "<html>hello world</html>");
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "injects when double pattern exists already and force-inject is set",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("3 chunk(s) injected")
              .and.to.contain("0 file(s) added");

            const txtContent = `${testContent}\n\n<!-- hello -->\n\nhello world\n\n<!-- hello -->`;
            const mdContent = `${testContent}\n\n<!-- auto-support -->\n\n${txtContent}\n\n<!-- auto-support -->`;
            const htmlContent = `${testContent}\n\n<!-- test -->\n\n<html>hello world</html>\n\n<!-- test -->`;
            expectFilesContentToMatch("./", ["test/test.md"], mdContent);
            expectFilesContentToMatch("./", ["test/test.txt"], txtContent);
            expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
          }
        );
    });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock.get("/test/test/master/.neat.yml").reply(
          200,
          `
          inject:
            - id: support
              file: test/test.md
              target: test/test.html
              pattern: "<!-- auto-support -->"
          ignore: [test/test.md]
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("injects when source file is in the ignored file(s) list", (ctx) => {
        expect(ctx.stdout)
          .to.contain("1 chunk(s) injected")
          .and.to.contain("2 file(s) added");

        const htmlContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
        expectFilesContentToMatch("./", ["test/test.txt"], testContent);
        expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
      });

    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock.get("/test/test/master/.neat.yml").reply(
          200,
          `
          inject:
          - id: support
            file: test/test.md
            target: test/test.html
            pattern: "<!-- auto-support -->"
          - id: hello
            target: [test/test.txt]
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("does not inject wrongly configured injections", (ctx) => {
        expect(ctx.stdout)
          .to.contain("1 chunk(s) injected")
          .and.to.contain("3 file(s) added");

        const htmlContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
        expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
        expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
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
