/**
 * Config types
 */

export interface ChunkType extends YamlInjectType {
  target: string;
  pattern: string;
  if: Array<"no-file" | "no-pattern" | "single-pattern" | "double-pattern">;
}

export interface SymLinkType {
  source: string;
  target: string;
}

export interface ScriptCommandType {
  script: string;
  toString: () => string;
}

export function isScriptCommandType(
  input: unknown
): input is ScriptCommandType {
  const obj = input as ScriptCommandType;
  if (typeof obj.script === "string") {
    return true;
  }
  return false;
}

export interface ReplacementType {
  before: string;
  after: string;
}

export interface QuestionType {
  name: string;
  type: "input" | "list" | "checkbox";
  message: string;
  default?: () => string;
  choices?: () => Array<string> | Array<QuestionChoiceType>;
}

export interface QuestionChoiceType {
  name: string;
  checked: boolean;
}

export function isQuestionChoiceType(
  input: unknown
): input is QuestionChoiceType {
  const obj = input as QuestionChoiceType;
  if (typeof obj.name === "string" && typeof obj.checked === "boolean") {
    return true;
  }
  return false;
}

/**
 * YAML types
 */

export interface YamlSymLinkType {
  [k: string]: string;
}

export function isYamlSymLinkType(input: unknown): input is YamlSymLinkType {
  const obj = input as YamlSymLinkType;
  const keys = Object.keys(obj);
  if (keys.length === 1 && typeof obj[keys[0]] === "string") {
    return true;
  }
  return false;
}

export interface YamlScriptType {
  script: string;
}

export function isYamlScriptType(input: unknown): input is YamlScriptType {
  const obj = input as YamlScriptType;
  if (typeof obj.script === "string") {
    return true;
  }
  return false;
}

export function isCommand<TValue>(
  value: TValue | null | undefined
): value is TValue {
  return (typeof value === "string" && value != "") || isYamlScriptType(value);
}

export interface YamlAskType {
  id: string;
  description?: string;
  default?: string | Array<string> | Array<YamlAskChoiceType>;
  replace?: boolean;
}

export function isYamlAskType(input: unknown): input is YamlAskType {
  const obj = input as YamlAskType;
  if (obj.id && typeof obj.id === "string") {
    return true;
  }
  return false;
}

export interface YamlAskChoiceType {
  [k: string]: boolean;
}

export function isYamlAskChoiceType(
  input: unknown
): input is YamlAskChoiceType {
  const obj = input as YamlAskChoiceType;
  const keys = Object.keys(obj);
  if (keys.length === 1 && typeof obj[keys[0]] === "boolean") {
    return true;
  }
  return false;
}

export interface YamlInjectType {
  id: string;
  target: string | Array<string>;
  pattern?: string;
  file?: string;
  url?: string;
  command?: string;
  before?: string;
  after?: string;
  if?: Array<"no-file" | "no-pattern" | "single-pattern" | "double-pattern">;
  ifnot?: Array<"no-file" | "no-pattern" | "single-pattern" | "double-pattern">;
}

export function isYamlInjectType(input: unknown): input is YamlInjectType {
  const obj = input as YamlInjectType;
  if (
    obj.id &&
    typeof obj.id === "string" &&
    obj.target &&
    (typeof obj.target === "string" || Array.isArray(obj.target)) &&
    ((obj.file && typeof obj.file === "string") ||
      (obj.url &&
        typeof obj.url === "string" &&
        /https?:\/\//i.test(obj.url)) ||
      (obj.command &&
        (typeof obj.command === "string" || isScriptCommandType(obj.command))))
  ) {
    return true;
  }
  return false;
}

/**
 * Other typeguards
 */

export function isNotEmpty<TValue>(
  value: TValue | string | null | undefined
): value is TValue {
  return value !== null && value !== undefined && value != "";
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
