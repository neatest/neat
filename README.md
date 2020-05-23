# neat

Neat is a CLI tool and a collection of the neatest repository templates to boost your repos.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [💾 Installation](#-installation)
- [🔥 CLI usage](#-cli-usage)
  - [Use an "official" repo](#use-an-official-repo)
  - [Use any repo](#use-any-repo)
  - [Specify a target folder](#specify-a-target-folder)
  - [Options](#options)
  - [Example use case](#example-use-case)
- [🤘 Creating a neat repo](#-creating-a-neat-repo)
  - [Pre-run](#pre-run)
  - [Ask questions](#ask-questions)
  - [Replacement pattern](#replacement-pattern)
  - [Replacement filter](#replacement-filter)
  - [Post-run](#post-run)
- [💚 Contributing](#-contributing)
  - [Top five ways to contribute](#top-five-ways-to-contribute)
  - [For maintainers](#for-maintainers)
- [💡 Todo](#-todo)
- [💬 Support](#-support)
- [📜 License](#-license)
- [⭕ About Olivr](#-about-olivr)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 💾 Installation

Install with:

- NPM

  ```sh
  npm install -g @olivr/neat
  ```

- Yarn

  ```sh
  yarn global add @olivr/neat
  ```

- Or use directly with NPX

  ```sh
  npx @olivr/neat repo
  ```

## 🔥 CLI usage

Essentially what Neat does is download files from a remote GitHub repo to a local folder and eventually ask questions and run pre-defined commands that would be specified in a `.neat.yml` at the root of the remote repo.

There is a collection of neat repos in [neat-repos.json](neat-repos.json) (See [contributing](#contributing) if you want to submit yours).
Although we look at the repo at the time of adding it to the list, we cannot vouch for any changes committed after that.

> ⚠️ As a general rule (not just for Neat), you should never execute a remote file without prior verification because it could have been tampered with malicious code.
> As such, it is always recommended to execute remote files in a controlled environment such as a remote CI environment or a local docker container to contain eventual damage.

### Use an "official" repo

Use a repo name from the [neat-repos.json](neat-repos.json)

Download files in the current working directory (without overwriting existing files):

```sh
neat repo
```

By default the `master` branch is used, if you prefer another branch/tag, you can use the @ notation:

```sh
neat repo@emoji
```

### Use any repo

Download files in the current working directory (without overwriting existing files):

```sh
neat your/repo
```

By default the `master` branch is used, if you prefer another branch/tag, you can use the @ notation:

```sh
neat your/repo@v2
```

### Specify a target folder

Download files in `my-project` (without overwriting existing files):

```sh
neat repo my-project
```

> This is usually used for creating a new repo using a neat template

### Options

#### -f, --force

Overwrite all local files with their remote counterparts.
If this flag is not used (default behaviour), Neat will skip remote files that exist locally.

```sh
neat repo --force
```

#### -e, --except

Filter out remote files from processing by passing a regular expression.

Example: Process all but markdown files

```sh
neat repo --except "\.md$"
```

> The regular expression is run as case insensitive.

#### -o, --only

Filter remote files to process by passing a regular expression.

Example: Process only markdown files

```sh
neat repo --only "\.md$"
```

> The regular expression is run as case insensitive.

### Example use case

Your organization, maintains a "default" repo which contains files to be used when creating other repositories:

```sh
docs/SECURITY.md
LICENSE
README.md
```

When you create a new repo you can use

```sh
neat organization/default new-repo
```

Or if you already worked in a repo and you forgot to create it from the default repo, you could run from within your repo folder, it will just add new files that are not present in your local folder and will not overwrite any files

```sh
neat organization/default
```

Now, let's say you want to:

- Make sure your repo's security policy is always up to date with your organization's latest security policy
- Add files from a repo template you created for your favourite framework on your personal GitHub account
- Add to your repo any new files added in the organization's default repo
- Add any generic files that you didn't create already from the [neatest repo](https://github.com/olivr-templates/neat-repo)

You could run the following (or add it in your CI pipeline, package.json, pre-commit hook, etc.)

```sh
neat organization/default -f -o docs/SECURITY.md
neat mygithub/favourite-framework
neat organization/default
neat oss
```

This is non invasive: it will not overwrite your files except for `docs/SECURITY.md`

## 🤘 Creating a neat repo

Each Neat repo can contain a `.neat.yml` configuration file which specifies what to do when someone "neats" your repo.

You can find configuration examples in the [examples](examples) folder

### Pre-run

Pre-run commands are run on the local machine before any files are processed.

> Those commands should be cross-OS compatible or tell in your README which environment should be used

### Ask questions

When someone neats your repository, you can ask him/her some questions and then use those values to [replace strings](#replacements) or run [any other arbitrary command](#answers-environment-variables).

A question is structured as follows:

```yml
ask:
  - id: project_name
    description: What is your project name?
    default: My project
```

- `id` is the only required field
- `description` is the actual question asked to the user. If it is not set, Neat will use the `id` by replacing underscores by spaces (eg. _Project name_)
- `default` is used to provide default values and determine the question type

Neat supports three question types: _input_, _choice_ and _multiple choice_ that are deducted based on the provided value for `default`

#### Input

If no default value is specified or if the default value is a **string**

```yml
ask:
  - id: project_name
    description: What is your project name?
```

![input type](docs/images/input.png "input type")

#### Choice

If the default value is a **list of strings**

```yml
ask:
  - id: ci
    description: What is your preferred CI?
    default: [Travis, Circle CI, Github Actions]
```

![choice type](docs/images/choice.png "choice type")

#### Multiple choice

If the default value is a **list of key/value pairs**

- `true` means this choice is checked by default
- `false` means this choice is unchecked by default

```yml
ask:
  - id: options
    description: What options do you want?
    default:
      - "Code Coverage": true
      - "PR template": false
      - "Issue templates": true
```

![multiple choice type](docs/images/multiple-choice.png "multiple choice type")

#### Replacements

Neat can search the added files and replace certain strings with answers to questions in the added files.

For each question, you can specify if Neat has to make a replacement by adding `replace: true`

```yml
ask:
  - id: project_name
    description: What is your project name?
    replace: true
```

This will have the effect of searching all added files and replacing the question ID in mustache style `{{project_name}}` with the value of the answer (eg. _My project_)

For the multiple choice question type, the answer is a string of comma-space-separated values (eg. _PR template, Issue templates_)

You can change the [pattern](#replacement-pattern) format or [filter](#replacement-filter) which files to search and replace.

If these replacement options are not enough for your use case, you can make use of the [post-run commands](#post-run) to do pretty much anything you like

### Replacement pattern

You can specify which pattern to replace. By default, it will search and replace mustache variables: `{{%s}}`.

**Example:** Replace HTML comments

```sh
ask:
  - id: project_name
    description: What is your project name?
    replace: true
replace_pattern: "<!-- %s -->"
```

### Replacement filter

You can specify which files to run replacements on. By default, it will search and replace in all added files.

**Example:** Make replacements only in markdown and text files

```sh
ask:
  - id: project_name
    description: What is your project name?
    replace: true
replace_filter: \.(md|txt)$
```

### Post-run

Post-run commands are run on the local machine after files are processed.

If you plan for other people to use those commands, you should make sure they can run on any OS, otherwise you should tell in your README which environment should be used.

#### Files environment variables

Post-run commands can access several environment variables.
These variables will never include files and directories filtered out using the --only or --except flags because they are simply not processed by Neat.

The most used environment variable is `NEAT_ADDED_FILES` because it contains a lit of files that were effectively added in the repo.

| Environment variable    | Description                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| NEAT_ALL_FILES_DIRS     | Space-separated list of all files and directories that were processed, whether they were added or skipped. |
| NEAT_ADDED_FILES_DIRS   | Space-separated list of files and directories that were added.                                             |
| NEAT_SKIPPED_FILES_DIRS | Space-separated list of files and directories that were skipped.                                           |
| NEAT_ALL_FILES          | Space-separated list of all files that were processed, whether they were added or skipped.                 |
| NEAT_ADDED_FILES        | Space-separated list of files that were added.                                                             |
| NEAT_SKIPPED_FILES      | Space-separated list of files that were skipped.                                                           |
| NEAT_ALL_DIRS           | Space-separated list of all directories that were processed, whether they were added or skipped.           |
| NEAT_ADDED_DIRS         | Space-separated list of directories that were added.                                                       |
| NEAT_SKIPPED_DIRS       | Space-separated list of directories that were skipped.                                                     |

#### Answers environment variables

In addition, if some questions were asked, their answers are available as environment variables constructed with the question ID in uppercase.

Examples:

- Will produce the environment variable `NEAT_ASK_PROJECT_NAME` whose value will be a string of the user's answer (eg. _My project_)

  ```yaml
  - id: project_name
  ```

- Will produce the environment variable `NEAT_ASK_CI` whose value will be a string of the user's answer (eg. _Circle CI_)

  ```yaml
  - id: ci
    default: [Travis, Circle CI, Github Actions]
  ```

- Will produce the environment variable `NEAT_ASK_OPTIONS` whose value will be a string of comma-separated answers (eg. _PR template, Issue templates_)

  ```yaml
  - id: options
    default:
      - "Code Coverage": true
      - "PR template": false
      - "Issue templates": true
  ```

## 💚 Contributing

[![Build](https://github.com/olivr-com/neat/workflows/Build%20&%20Publish%20CLI/badge.svg)](https://github.com/olivr-com/neat/actions?query=workflow%3A%22Build+%26+Publish+CLI%22)
[![Codecov](https://codecov.io/gh/olivr-com/neat/branch/master/graph/badge.svg)](https://codecov.io/gh/olivr-com/neat)

If you created a neat repo you're proud of, please add it to the official repo list:

1. Fork this repo

2. Add your repo to [neat-repos.json](neat-repos.json)

   - The syntax is `"name": "repo/path"`. As a result, running `neat name` will fetch `repo/path`
   - Insert your repo in alphabetical order
   - Only use strings, numbers and dashes (-) in the neat name. It must not start or end with a dash

3. [Open a pull request](https://github.com/olivr-com/neat/compare)

### Top five ways to contribute

⭐ Star this repo: it's quick and goes a long way! [🔝](#top)

🗣️ [Spread the word](docs/CONTRIBUTING.md#spread-the-word)

🐞 [Report bugs](docs/CONTRIBUTING.md#report-bugs)

✅ [Resolve issues](docs/CONTRIBUTING.md#resolve-issues)

📝 [Improve the documentation](docs/CONTRIBUTING.md#improve-the-documentation)

Please see the [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for more information.

### For maintainers

We follow [Semantic versioning](https://semver.org/) and make use of [Yarn version](https://classic.yarnpkg.com/docs/cli/version) to manage new versions.

#### Patch

When you make backwards compatible bug fixes:

```sh
yarn version --patch
```

#### New feature

When you add functionality in a backwards compatible manner:

```sh
yarn version --minor
```

#### Major version

When you make incompatible API changes:

```sh
yarn version --major
```

## 💡 Todo

- [ ] **Specify files to ignore in `.neat.yml`**
- [ ] **Add --silent flag and specify answers as arguments for CI environments**
- [ ] Manage file sections within files (inject remote file content or a command output within a local file)
- [ ] GitHub action running on a schedule to perform automated verification of pre/post run commands in list of neatest repos and add the SHA of the latest commit to `neatest-repos.json`
- [ ] When neating a repo, verify which SHA is used and display a warning if it has not been verified yet
- [ ] Provide a Docker image with Neat already installed to easily run it in a containerized environment

<!-- auto-support -->

## 💬 Support

Join [Olivr](https://keybase.io/team/olivr) on Keybase 🔐

Or you can use our [Reddit community](https://www.reddit.com/r/olivr/)

<!-- auto-support -->

<!-- auto-license -->

## 📜 License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details

<!-- auto-license -->

<!-- auto-about-org -->

## ⭕ About Olivr

[Olivr](https://olivr.com) is an AI co-founder for your startup.

<!-- auto-about-org -->
