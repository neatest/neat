import { expect } from "@oclif/test";
import { cli } from "cli-ux";
import { existsSync, readFileSync } from "fs-extra";
import { stub } from "sinon";

stub(cli.action, "start");

export const testContent = `# {{project_name}}
Welcome to <!-- project_name -->

## Options
{{options}}

## CI
{{ci}}

## Support
[Get Support]({{support_url}})`;

export function expectFilesContentToMatch(
  folder = "./",
  files = ["test/test.md", "test/test.txt", "test/test.html"],
  content = testContent
) {
  files.forEach((file) => {
    expect(existsSync(folder + file)).to.be.true;
    expect(readFileSync(folder + file, "utf-8")).to.equal(content);
  });
}
