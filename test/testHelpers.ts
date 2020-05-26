import { expect } from "@oclif/test";
import { existsSync, readFileSync } from "fs-extra";

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
