import { format } from "util";
import { parse } from "yaml";

export class NeatConfig {
  public preRun: Array<string>;
  public postRun: Array<string>;
  public ignore: Array<string>;
  public questions: Array<NeatConfigQuestionType>;
  public replacePattern = "{{%s}}";
  public replaceFilter = /.*/i;
  public replacements: { [key: string]: string } = {};

  protected to_replace: Array<string> = [];

  constructor(config: string) {
    const yaml = parse(config) || {};

    // pre_run
    this.preRun = yaml.pre_run ? this.parseArrayStrings(yaml.pre_run) : [];

    // post_run
    this.postRun = yaml.post_run ? this.parseArrayStrings(yaml.post_run) : [];

    // ignore
    this.ignore = yaml.ignore ? this.parseArrayStrings(yaml.ignore) : [];

    // ask
    this.questions =
      yaml.ask && Array.isArray(yaml.ask) && yaml.ask.length > 0
        ? this.parseArrayQuestions(yaml.ask)
        : [];

    // replacement pattern
    if (yaml.replace_pattern && typeof yaml.replace_pattern == "string")
      this.replacePattern = yaml.replace_pattern;

    // replacement filter
    if (yaml.replace_filter && typeof yaml.replace_filter == "string")
      this.replaceFilter = new RegExp(yaml.replace_filter, "i");
  }

  public hasQuestions() {
    return this.questions && this.questions.length > 0 ? true : false;
  }

  public hasIgnore() {
    return this.ignore && this.ignore.length > 0 ? true : false;
  }

  public hasPreRun() {
    return this.preRun && this.preRun.length > 0 ? true : false;
  }

  public hasPostRun() {
    return this.postRun && this.postRun.length > 0 ? true : false;
  }

  public hasReplace() {
    return this.to_replace.length > 0 ? true : false;
  }

  public addReplacementsFromAnswers(answers: {
    [key: string]: string | Array<string>;
  }) {
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

  public getAnswersFromVars() {
    const answers: { [key: string]: string } = {};

    this.questions.forEach((question) => {
      const envVar = process.env[this.formatQuestionVar(question.name)];
      answers[question.name] = envVar ? envVar : "";
    });

    return answers;
  }

  public getEnvFromAnswers(answers: { [key: string]: string | Array<string> }) {
    const env: { [key: string]: string } = {};

    Object.keys(answers).map((key: string) => {
      const answer = answers[key];
      const newAnswer = Array.isArray(answer) ? answer.join(", ") : answer;
      const envName = this.formatQuestionVar(key);
      env[envName] = newAnswer;
    });

    return env;
  }

  protected formatQuestionVar(question: string) {
    return "NEAT_ASK_" + question.replace(" ", "_").toUpperCase();
  }

  // Make sure we get an array of strings
  protected parseArrayStrings(input: string | Array<string>): Array<string> {
    let output: Array<string> = [];

    if (input) {
      if (Array.isArray(input) && input.length > 0)
        output = input.filter(this.onlyStringArrayFilter);
      if (typeof input === "string") output = [input];
    }

    return output;
  }

  // Make sure we get an array of questions
  protected parseArrayQuestions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: Array<any>
  ): Array<NeatConfigQuestionType> {
    return input
      .map((question) => this.parseQuestion(question))
      .filter(this.notEmptyArrayFilter);
  }

  // Make sure we get a question
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parseQuestion(input: any): NeatConfigQuestionType | null {
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

  protected notEmptyArrayFilter<TValue>(
    value: TValue | null | undefined
  ): value is TValue {
    return value !== null && value !== undefined;
  }

  protected onlyStringArrayFilter<TValue>(
    value: TValue | null | undefined
  ): value is TValue {
    return typeof value === "string" && value != "";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onlyChoiceArrayFilter(value: any) {
    return (
      typeof value === "object" &&
      Object.keys(value)[0] &&
      typeof value[Object.keys(value)[0]] === "boolean"
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
