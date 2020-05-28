import { format } from "util";
import { parse } from "yaml";

export class NeatConfig {
  preRun: Array<string>;
  symLink: Array<SymLinkType>;
  preDownload: Array<string>;
  postRun: Array<string>;
  ignore: Array<string>;
  questions: Array<NeatConfigQuestionType>;
  chunks: Array<ChunkType>;
  replacePattern = "{{%s}}";
  replaceFilter = /.*/i;
  replacements: { [key: string]: string } = {};

  to_replace: Array<string> = [];

  constructor(config: string, readonly base_url: string) {
    const yaml = parse(config) || {};

    // pre-run
    this.preRun = yaml["pre-run"]
      ? this.parseArrayStrings(yaml["pre-run"])
      : [];

    // symlink
    this.symLink =
      yaml.symlink && Array.isArray(yaml.symlink) && yaml.symlink.length > 0
        ? yaml.symlink.filter(this.onlySymLinkArrayFilter)
        : [];

    // pre-download
    this.preDownload = yaml["pre-download"]
      ? this.parseArrayStrings(yaml["pre-download"])
      : [];

    // post-run
    this.postRun = yaml["post-run"]
      ? this.parseArrayStrings(yaml["post-run"])
      : [];

    // ignore
    this.ignore = yaml.ignore ? this.parseArrayStrings(yaml.ignore) : [];

    // ask
    this.questions =
      yaml.ask && Array.isArray(yaml.ask) && yaml.ask.length > 0
        ? this.parseArrayQuestions(yaml.ask)
        : [];

    // inject
    this.chunks =
      yaml.inject && Array.isArray(yaml.inject) && yaml.inject.length > 0
        ? this.parseArrayChunks(yaml.inject)
        : [];

    // replacement pattern
    if (yaml.replace_pattern && typeof yaml.replace_pattern == "string")
      this.replacePattern = yaml.replace_pattern;

    // replacement filter
    if (yaml.replace_filter && typeof yaml.replace_filter == "string")
      this.replaceFilter = new RegExp(yaml.replace_filter, "i");
  }

  hasQuestions() {
    return this.questions && this.questions.length > 0 ? true : false;
  }

  hasChunks() {
    return this.chunks && this.chunks.length > 0 ? true : false;
  }

  hasSymLink() {
    return this.symLink && this.symLink.length > 0 ? true : false;
  }

  hasPreRun() {
    return this.preRun && this.preRun.length > 0 ? true : false;
  }

  hasPreDownload() {
    return this.preDownload && this.preDownload.length > 0 ? true : false;
  }

  hasPostRun() {
    return this.postRun && this.postRun.length > 0 ? true : false;
  }

  hasReplace() {
    return this.to_replace.length > 0 ? true : false;
  }

  addReplacementsFromAnswers(answers: { [key: string]: string }) {
    return Object.keys(answers).map((key: string) => {
      if (this.to_replace.includes(key)) {
        const answer = answers[key];
        this.replacements[format(this.replacePattern, key)] = Array.isArray(
          answer
        )
          ? answer.join(", ")
          : answer;
      }
    });
  }

  getAnswersFromVars() {
    const answers: { [key: string]: string } = {};

    this.questions.forEach((question) => {
      const envVar = process.env[this.formatQuestionVar(question.name)];
      answers[question.name] = envVar ? envVar : "";
    });

    return answers;
  }

  getEnvFromAnswers(answers: { [key: string]: string }) {
    const env: { [key: string]: string } = {};

    Object.keys(answers).map((key: string) => {
      const answer = answers[key];
      const newAnswer = Array.isArray(answer) ? answer.join(", ") : answer;
      const envName = this.formatQuestionVar(key);
      env[envName] = newAnswer;
    });

    return env;
  }

  formatQuestionVar(question: string) {
    return "NEAT_ASK_" + question.replace(" ", "_").toUpperCase();
  }

  // Make sure we get an array of strings
  parseArrayStrings(input: string | Array<string>): Array<string> {
    let output: Array<string> = [];

    if (input) {
      if (Array.isArray(input) && input.length > 0)
        output = input.filter(this.onlyStringArrayFilter);
      if (typeof input === "string") output = [input];
    }

    return output;
  }

  // Make sure we get an array of chunks
  parseArrayChunks(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: Array<any>
  ): Array<ChunkType> {
    const parsedChunks = input
      .map((chunk) => this.parseChunk(chunk))
      .filter(this.notEmptyArrayFilter);

    const chunks: Array<ChunkType> = [];

    parsedChunks.forEach((chunk) => {
      if (Array.isArray(chunk.target))
        chunk.target.forEach((target) => {
          const newChunk = { ...(chunk as ChunkType) };
          newChunk.target = target;
          chunks.push(newChunk);
        });
      else chunks.push(chunk as ChunkType);
    });

    return chunks;
  }

  // Make sure we get an array of questions
  parseArrayQuestions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: Array<any>
  ): Array<NeatConfigQuestionType> {
    return input
      .map((question) => this.parseQuestion(question))
      .filter(this.notEmptyArrayFilter);
  }

  // Make sure we get a question
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseQuestion(input: any): NeatConfigQuestionType | null {
    let question: NeatConfigQuestionType | null = null;

    if (typeof input === "object") {
      if (input.id) {
        question = {
          name: input.id,
          type: "input",
          message: input.id.replace("_", " "),
        };

        if (input.description && typeof input.description === "string")
          question.message = input.description;

        if (input.replace && input.replace === true)
          this.to_replace.push(input.id);

        if (input.default) {
          if (typeof input.default === "string")
            question.default = input.default;
          else if (Array.isArray(input.default)) {
            question.type = "list";
            let choices = input.default.filter(this.onlyStringArrayFilter);

            if (!choices.length) {
              question.type = "checkbox";
              choices = input.default
                .filter(this.onlyChoiceArrayFilter)
                .map((val: { [key: string]: boolean }) => {
                  return {
                    name: Object.keys(val)[0],
                    checked: val[Object.keys(val)[0]],
                  };
                });
            }
            question.choices = choices;
          }
        }
      }
    }
    return question;
  }

  // Make sure we get a chunk
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseChunk(input: any): TempChunkType | null {
    let chunk: TempChunkType | null = null;

    if (typeof input === "object") {
      if (
        input.id &&
        typeof input.id === "string" &&
        input.target &&
        (Array.isArray(input.target) || typeof input.target === "string") &&
        ((input.file && typeof input.file === "string") ||
          (input.url &&
            typeof input.url === "string" &&
            /https?:\/\//i.test(input.url)) ||
          (input.command && typeof input.command === "string"))
      ) {
        chunk = {
          id: input.id,
          target: input.target,
          pattern:
            input.pattern && typeof input.pattern === "string"
              ? input.pattern
              : `<!-- ${input.id} -->`,
        };

        if (input.file) {
          const folderRegex = new RegExp(
            `^(${this.ignore.map((v) => v.replace(/\/$/, "")).join("|")})/`,
            "i"
          );
          if (
            this.ignore.length > 0 &&
            (this.ignore.includes(input.file) || folderRegex.test(input.file))
          ) {
            chunk.url = this.base_url + input.file;
          } else chunk.file = input.file;
        } else if (input.url) chunk.url = input.url;
        else if (input.command) chunk.command = input.command;
      }
    }
    return chunk;
  }

  notEmptyArrayFilter<TValue>(
    value: TValue | null | undefined
  ): value is TValue {
    return value !== null && value !== undefined;
  }

  onlyStringArrayFilter<TValue>(
    value: TValue | null | undefined
  ): value is TValue {
    return typeof value === "string" && value != "";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onlyChoiceArrayFilter(value: any) {
    return (
      typeof value === "object" &&
      Object.keys(value)[0] &&
      typeof value[Object.keys(value)[0]] === "boolean"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onlySymLinkArrayFilter(value: any) {
    return (
      typeof value === "object" &&
      Object.keys(value)[0] &&
      typeof value[Object.keys(value)[0]] === "string"
    );
  }
}

export type NeatConfigReplacementType = {
  before: string;
  after: string;
};

export type NeatConfigQuestionType = {
  name: string;
  type: "input" | "list" | "checkbox";
  message: string;
  default?: () => string;
  choices?: () => Array<string> | Array<{ name: string; checked: boolean }>;
};

export interface ChunkType extends TempChunkType {
  target: string;
}
export interface SymLinkType {
  [k: string]: string;
}

interface TempChunkType {
  id: string;
  pattern: string;
  file?: string;
  url?: string;
  command?: string;
  target: string | Array<string>;
}
