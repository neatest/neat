/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/camelcase */
import { expect, test } from "@oclif/test";
import { cli } from "cli-ux";
import {
  ensureFileSync,
  existsSync,
  removeSync,
  writeFileSync,
} from "fs-extra";
import nock from "nock";
import { expectFilesContentToMatch, testContent } from "./testHelpers";

const mockInquirer = require("mock-inquirer");

import cmd = require("../src");

describe("INJECT", () => {
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
   * Generic
   */
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

  describe("wrap", () => {
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
              wrap: before
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "add pattern before the injected content when wrap is before",
        (ctx) => {
          expect(ctx.stdout).to.contain("1 chunk(s) injected");
          const htmlContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}`;
          expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );

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
              wrap: [after]
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "add pattern after the injected content when wrap is after",
        (ctx) => {
          expect(ctx.stdout).to.contain("1 chunk(s) injected");
          const htmlContent = `${testContent}\n\n${testContent}\n\n<!-- auto-support -->`;
          expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );
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
              wrap: [before, after]
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "add pattern before and after the injected content when wrap is before and after",
        (ctx) => {
          expect(ctx.stdout).to.contain("1 chunk(s) injected");
          const htmlContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
          expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );

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
              wrap: false
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "don't wrap the injected content with any pattern when wrap is false",
        (ctx) => {
          expect(ctx.stdout).to.contain("1 chunk(s) injected");
          const htmlContent = `${testContent}\n\n${testContent}`;
          expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );

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
              wrap: []
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it(
        "don't wrap the injected content with any pattern when wrap is empty",
        (ctx) => {
          expect(ctx.stdout).to.contain("1 chunk(s) injected");
          const htmlContent = `${testContent}\n\n${testContent}`;
          expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );
  });

  /**
   * No file
   */
  describe("no file", () => {
    test
      .stub(cli, "anykey", () => async () => Promise.resolve())
      .nock("https://raw.githubusercontent.com", (nock) => {
        nock.get("/test/test/master/.neat.yml").reply(
          200,
          `inject:
            - id: hello
              command: echo "hello world"
              target: test/testing/notfound.html
          `
        );
      })
      .stdout()
      .do(() => cmd.run(["test"]))
      .it("injects when no file is found", (ctx) => {
        expect(ctx.stdout)
          .to.contain("1 chunk(s) injected")
          .and.to.contain("3 file(s) added");

        const htmlContent = "<!-- hello -->\n\nhello world\n\n<!-- hello -->";
        expectFilesContentToMatch();
        expectFilesContentToMatch(
          "./",
          ["test/testing/notfound.html"],
          htmlContent
        );
      });

    describe("before/after", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/testing/notfound.html
              before: "## Options"
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it("injects when no file is found & before is used", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("3 file(s) added");

          const htmlContent = "<!-- hello -->\n\nhello world\n\n<!-- hello -->";
          expectFilesContentToMatch();
          expectFilesContentToMatch(
            "./",
            ["test/testing/notfound.html"],
            htmlContent
          );
        });

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/testing/notfound.html
              after: "## Options"
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it("injects when no file is found & after is used", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("3 file(s) added");

          const htmlContent = "<!-- hello -->\n\nhello world\n\n<!-- hello -->";
          expectFilesContentToMatch();
          expectFilesContentToMatch(
            "./",
            ["test/testing/notfound.html"],
            htmlContent
          );
        });
    });

    describe("if/ifnot", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [no-file]
              command: echo "hello world"
              target: test/testing/notfound.html
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it("injects when no file is found & if includes no file", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("3 file(s) added");

          const htmlContent = "<!-- hello -->\n\nhello world\n\n<!-- hello -->";
          expectFilesContentToMatch();
          expectFilesContentToMatch(
            "./",
            ["test/testing/notfound.html"],
            htmlContent
          );
        });

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [no-pattern, single-pattern, double-pattern]
              command: echo "hello world"
              target: test/testing/notfound.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when no file is found & if doesn't include no file",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
            expect(existsSync("test/testing/notfound.html")).to.be.false;
          }
        );

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              ifnot: [no-file, double-pattern]
              command: echo "hello world"
              target: test/testing/notfound.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when no file is found & ifnot includes no file",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
            expect(existsSync("test/testing/notfound.html")).to.be.false;
          }
        );
    });
  });

  /**
   * No pattern
   */
  describe("no pattern", () => {
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

    describe("--force", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => ensureFileSync("test/test.html"))
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "injects when no pattern is found & file existed before & force is set",
          (ctx) => {
            expect(ctx.stdout).to.contain("1 chunk(s) injected");
            expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
            expectFilesContentToMatch(
              "./",
              ["test/test.html"],
              "<!-- other -->\n\nhello world\n\n<!-- other -->"
            );
          }
        );
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => ensureFileSync("test/test.html"))
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when no pattern is found & file existed before & force is not set",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch("./", ["test/test.txt", "test/test.md"]);
            expectFilesContentToMatch("./", ["test/test.html"], "");
          }
        );
    });

    describe("before/after", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              command: echo "hello world"
              target: test/test.html
              before: "## Options"
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it("injects when no pattern is found & before is used", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("3 file(s) added");

          const htmlContent = testContent.replace(
            "## Options",
            "<!-- hello -->\n\nhello world\n\n<!-- hello -->\n## Options"
          );
          expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
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
              after: "## Options"
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it("injects when no pattern is found & after is used", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("3 file(s) added");

          const htmlContent = testContent.replace(
            "## Options",
            "## Options\n<!-- hello -->\n\nhello world\n\n<!-- hello -->"
          );
          expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
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
              before: "I do not exist"
          `
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "injects when no pattern is found & before or after is used & before/after pattern is not found",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("1 chunk(s) injected")
              .and.to.contain("3 file(s) added");

            const htmlContent =
              testContent +
              "\n\n<!-- hello -->\n\nhello world\n\n<!-- hello -->";
            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
          }
        );
    });

    describe("if/ifnot", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [no-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "injects when no pattern is found & if includes no pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("1 chunk(s) injected");

            const htmlContent =
              testContent +
              "\n\n<!-- other -->\n\nhello world\n\n<!-- other -->";
            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
          }
        );

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [no-file, single-pattern, double-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when no pattern is found & if doesn't include no pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
          }
        );

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              ifnot: [no-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- other -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when no pattern is found & ifnot includes no pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
          }
        );
    });
  });

  /**
   * Single pattern
   */
  describe("single pattern", () => {
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

    describe("--force", () => {
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
        .do(() => {
          writeFileSync("test/test.html", "<!-- project_name -->");
        })
        .do(() => cmd.run(["test", "--force-inject"]))
        .it("injects when a single pattern is found & force is set", (ctx) => {
          expect(ctx.stdout)
            .to.contain("1 chunk(s) injected")
            .and.to.contain("2 file(s) added");

          expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
          expectFilesContentToMatch(
            "./",
            ["test/test.html"],
            "<!-- project_name -->\n\nhello world\n\n<!-- project_name -->"
          );
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
        .do(() => {
          writeFileSync("test/test.html", "<!-- project_name -->");
        })
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when a single pattern is found & force is not set",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("0 chunk(s) injected")
              .and.to.contain("2 file(s) added");

            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch(
              "./",
              ["test/test.html"],
              "<!-- project_name -->"
            );
          }
        );
    });

    describe("if/ifnot", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [single-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "injects when a single pattern is found & if includes single pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("1 chunk(s) injected");

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
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              if: [no-file, no-pattern, double-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when a single pattern is found & if doesn't include single pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
          }
        );

      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").reply(
            200,
            `inject:
            - id: hello
              ifnot: [no-file, single-pattern, double-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when a single pattern is found & ifnot includes single pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("0 chunk(s) injected");
            expectFilesContentToMatch();
          }
        );
    });
  });

  /**
   * Double pattern
   */
  describe("double pattern", () => {
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
      .it(
        "doesn't inject when a double pattern is found & force is not set",
        (ctx) => {
          expect(ctx.stdout)
            .to.contain("3 chunk(s) skipped")
            .and.to.contain("3 file(s) skipped");

          const mdContent = `${testContent}\n\n<!-- auto-support -->\n\n${testContent}\n\n<!-- auto-support -->`;
          const txtContent = `${testContent}\n\n<!-- hello -->\n\nhello world\n\n<!-- hello -->`;
          const htmlContent = `${testContent}\n\n<!-- test -->\n\n<html>hello world</html>\n\n<!-- test -->`;
          expectFilesContentToMatch("./", ["test/test.md"], mdContent);
          expectFilesContentToMatch("./", ["test/test.txt"], txtContent);
          expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
        }
      );
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
        .it("injects when a double pattern is found & force is set", (ctx) => {
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
            .times(4) // Because of dry-run using up two
            .reply(200, "<html>hello world</html>");
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "injects when a double pattern is found & force-inject is set",
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
        .do(() =>
          writeFileSync(
            "test/test.html",
            "<!-- project_name -->test<!-- project_name -->"
          )
        )
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when a double pattern is found & force is not set",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("0 chunk(s) injected")
              .and.to.contain("2 file(s) added");

            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch(
              "./",
              ["test/test.html"],
              "<!-- project_name -->test<!-- project_name -->"
            );
          }
        );
    });
    describe("if/ifnot", () => {
      test
        .stub(cli, "anykey", () => async () => Promise.resolve())
        .nock("https://raw.githubusercontent.com", (nock) => {
          nock.get("/test/test/master/.neat.yml").twice().reply(
            200,
            `inject:
            - id: hello
              if: [single-pattern, double-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "injects when double pattern is found & force is set & if includes double-pattern",
          (ctx) => {
            expect(ctx.stdout).to.contain("1 chunk(s) injected");

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
          nock.get("/test/test/master/.neat.yml").twice().reply(
            200,
            `inject:
            - id: hello
              if: [no-file, no-pattern, single-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "doesn't inject when double pattern is found & force is set & if doesn't include double-pattern",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("0 chunk(s) injected")
              .and.to.contain("1 chunk(s) skipped");

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
          nock.get("/test/test/master/.neat.yml").twice().reply(
            200,
            `inject:
            - id: hello
              ifnot: double-pattern
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test", "--force-inject"]))
        .it(
          "doesn't inject when double pattern is found & force is set & ifnot includes double-pattern",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("0 chunk(s) injected")
              .and.to.contain("1 chunk(s) skipped");

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
          nock.get("/test/test/master/.neat.yml").twice().reply(
            200,
            `inject:
            - id: hello
              if: [single-pattern, double-pattern]
              command: echo "hello world"
              target: test/test.html
              pattern: "<!-- project_name -->"`
          );
        })
        .stdout()
        .do(() => cmd.run(["test"]))
        .stdout()
        .do(() => cmd.run(["test"]))
        .it(
          "doesn't inject when double pattern is found & force is not set & if includes double-pattern",
          (ctx) => {
            expect(ctx.stdout)
              .to.contain("0 chunk(s) injected")
              .and.to.contain("1 chunk(s) skipped");

            const htmlContent = testContent.replace(
              "<!-- project_name -->",
              "<!-- project_name -->\n\nhello world\n\n<!-- project_name -->"
            );
            expectFilesContentToMatch("./", ["test/test.md", "test/test.txt"]);
            expectFilesContentToMatch("./", ["test/test.html"], htmlContent);
          }
        );
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
