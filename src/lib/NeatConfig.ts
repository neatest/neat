import { format } from "util";
import { parse } from "yaml";
import { debug } from "./debug";
import {
  ChunkType,
  isCommand,
  isNotEmpty,
  isString,
  isYamlAskChoiceType,
  isYamlAskType,
  isYamlInjectType,
  isYamlScriptType,
  isYamlSymLinkType,
  QuestionType,
  ScriptCommandType,
  SymLinkType,
  YamlAskType,
  YamlInjectType,
} from "./NeatConfigTypes";

export class NeatConfig {
  preRun: Array<string | ScriptCommandType>;
  preDownload: Array<string | ScriptCommandType>;
  postRun: Array<string | ScriptCommandType>;
  symLink: Array<SymLinkType>;
  ignore: Array<string>;
  questions: Array<QuestionType>;
  chunks: Array<ChunkType>;
  replacePattern = "{{%s}}";
  replaceFilter = /.*/i;
  replacements: { [key: string]: string } = {};

  toReplace: Array<string> = [];

  constructor(config: string, readonly baseUrl: string) {
    const yaml = parse(config, { prettyErrors: true }) || {};

    debug("parsed YAML configuration", yaml);

    // symlink
    this.symLink = yaml.symlink ? this.parseArraySymLinks(yaml.symlink) : [];

    // pre-run
    this.preRun = yaml["pre-run"]
      ? this.parseArrayCommands(yaml["pre-run"])
      : [];

    // pre-download
    this.preDownload = yaml["pre-download"]
      ? this.parseArrayCommands(yaml["pre-download"])
      : [];

    // post-run
    this.postRun = yaml["post-run"]
      ? this.parseArrayCommands(yaml["post-run"])
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
    if (yaml.replace_pattern && isString(yaml.replace_pattern))
      this.replacePattern = yaml.replace_pattern;

    // replacement filter
    if (yaml.replace_filter && isString(yaml.replace_filter))
      this.replaceFilter = new RegExp(yaml.replace_filter, "i");

    debug("NeatConfig object", this);
  }

  /**
   * Checkers
   */

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
    return this.toReplace.length > 0 ? true : false;
  }

  /**
   * Commands (pre-run, pre-download, post-run)
   */

  // Make sure we get an array of commands
  parseArrayCommands(input: unknown): Array<string | ScriptCommandType> {
    const output = Array.isArray(input) ? input : [input];
    return output.filter(isCommand).map((command) => {
      if (isYamlScriptType(command))
        command.toString = function () {
          return this.script;
        };
      return command;
    });
  }

  /**
   * Ignore
   */

  // Make sure we get an array of strings
  parseArrayStrings(input: unknown): Array<string> {
    const output = Array.isArray(input) ? input : [input];
    return output.filter(isString);
  }

  /**
   * Symbolic links
   */

  // Make sure we get an array of symlinks
  parseArraySymLinks(input: unknown): Array<SymLinkType> {
    const symLinks = Array.isArray(input) ? input : [input];

    return symLinks.filter(isYamlSymLinkType).map((symLink) => {
      const target = Object.keys(symLink)[0];
      return {
        target: target,
        source: symLink[target],
      };
    });
  }

  /**
   * Injections
   */

  // Make sure we get an array of chunks
  parseArrayChunks(input: unknown): Array<ChunkType> {
    const chunks = Array.isArray(input) ? input : [input];
    const output: Array<ChunkType> = [];

    chunks
      .filter(isYamlInjectType)
      .map((chunk) => this.parseChunk(chunk))
      .filter(isNotEmpty)
      .forEach((chunk) => {
        if (Array.isArray(chunk.target))
          chunk.target.forEach((target) => {
            const newChunk = { ...chunk };
            newChunk.target = target;
            output.push(newChunk as ChunkType);
          });
        else output.push(chunk as ChunkType);
      });

    return output;
  }

  // Make sure we get a chunk
  parseChunk(input: YamlInjectType): YamlInjectType | null {
    const chunk: YamlInjectType = {
      id: input.id,
      target: input.target,
    };

    // Pattern
    chunk.pattern =
      input.pattern && typeof input.pattern === "string"
        ? input.pattern
        : `<!-- ${input.id} -->`;

    // Injection type
    // file
    if (input.file) {
      const folderRegex = new RegExp(
        `^(${this.ignore.map((v) => v.replace(/\/$/, "")).join("|")})/`,
        "i"
      );
      if (this.ignore.includes(input.file) || folderRegex.test(input.file))
        chunk.url = this.baseUrl + input.file;
      else chunk.file = input.file;
    }
    // url
    else if (input.url && isString(input.url)) chunk.url = input.url;
    // command
    else if (input.command) chunk.command = input.command;

    // Before / after
    if (input.before) chunk.before = input.before;
    else if (input.after) chunk.after = input.after;

    // If / if not
    const ifTypes: Array<
      "no-file" | "no-pattern" | "single-pattern" | "double-pattern"
    > = ["no-file", "no-pattern", "single-pattern", "double-pattern"];

    if (input.if && typeof input.if === "string" && ifTypes.includes(input.if))
      chunk.if = [input.if];
    else if (Array.isArray(input.if) && input.if.length > 0)
      chunk.if = input.if.filter((i) => ifTypes.includes(i));
    else if (
      input.ifnot &&
      typeof input.ifnot === "string" &&
      ifTypes.includes(input.ifnot)
    ) {
      const ifnot = [input.ifnot];
      chunk.if = ifTypes.filter((v) => !ifnot.includes(v));
    } else if (Array.isArray(input.ifnot) && input.ifnot.length > 0) {
      const ifnot = input.ifnot.filter((i) => ifTypes.includes(i));
      chunk.if = ifTypes.filter((v) => !ifnot.includes(v));
    } else chunk.if = ifTypes;

    // Wrap
    chunk.wrap = {
      before: chunk.pattern + "\n\n",
      after: "\n\n" + chunk.pattern,
    };
    if (input.wrap && typeof input.wrap === "string")
      chunk.wrap = { before: input.wrap, after: input.wrap };
    else if (input.wrap === false) chunk.wrap = { before: "", after: "" };
    else if (typeof input.wrap === "object") {
      if (input.wrap.before && typeof input.wrap.before === "string")
        chunk.wrap.before = input.wrap.before;
      else if (input.wrap.before === false) chunk.wrap.before = "";
      if (input.wrap.after && typeof input.wrap.after === "string")
        chunk.wrap.after = input.wrap.after;
      else if (input.wrap.after === false) chunk.wrap.after = "";
    }

    return chunk;
  }

  /**
   * Questions
   */

  parseArrayQuestions(input: unknown): Array<QuestionType> {
    const questions = Array.isArray(input) ? input : [input];

    return questions
      .filter(isYamlAskType)
      .map((question) => this.parseQuestion(question));
  }

  // Make sure we get a question
  parseQuestion(input: YamlAskType): QuestionType {
    const question: QuestionType = {
      name: input.id,
      type: "input",
      message: input.id.replace("_", " "),
    };

    if (input.description && typeof input.description === "string")
      question.message = input.description;

    if (input.default) {
      if (input.default && typeof input.default === "string")
        question.default = () => input.default as string;
      else if (Array.isArray(input.default)) {
        const choices = input.default as Array<unknown>;

        const singleChoices = choices.filter(isString);
        if (singleChoices.length > 0) {
          question.type = "list";
          question.choices = () => singleChoices;
        } else {
          const multiChoices = choices
            .filter(isYamlAskChoiceType)
            .map((val) => {
              const keys = Object.keys(val);
              const key = keys[0];
              return {
                name: key,
                checked: val[key],
              };
            });
          if (multiChoices.length > 0) {
            question.type = "checkbox";
            question.choices = () => multiChoices;
          }
        }
      }
    }

    if (input.replace === true) this.toReplace.push(input.id);

    return question;
  }

  getQuestions() {
    return this.questions.map((q) => {
      const envVar = process.env[this.formatQuestionVar(q.name)];
      if (envVar && q.type === "input") q.default = () => envVar;
      return q;
    });
  }

  addReplacementsFromAnswers(answers: { [key: string]: string }) {
    return Object.keys(answers).map((key: string) => {
      if (this.toReplace.includes(key)) {
        const answer = answers[key];
        const pattern = format(this.replacePattern, key);
        this.replacements[pattern] = Array.isArray(answer)
          ? answer.join(", ")
          : answer;
      }
    });
  }

  getAnswersFromEnv(env: { [k: string]: string | undefined }) {
    const answers: { [key: string]: string } = {};

    this.questions.forEach((question) => {
      const envVar = env[this.formatQuestionVar(question.name)];
      answers[question.name] = envVar ? envVar : "";
    });

    return answers;
  }

  getEnvFromAnswers(answers: { [key: string]: string }) {
    const env: Array<{ name: string; value: string }> = [];

    Object.keys(answers).forEach((key: string) => {
      const answer = answers[key];
      const newAnswer = Array.isArray(answer) ? answer.join(", ") : answer;
      const envName = this.formatQuestionVar(key);
      env.push({ name: envName, value: newAnswer });
    });

    return env;
  }

  formatQuestionVar(question: string) {
    return "NEAT_ASK_" + question.replace(/[\s-]/, "_").toUpperCase();
  }
}
