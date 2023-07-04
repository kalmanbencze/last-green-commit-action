import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(err: any): void {
  console.error(err);

  if (err && err.message) {
    core.setFailed(err.message);
  } else {
    core.setFailed(`Unhandled error: ${err}`);
  }
}

process.on("unhandledRejection", handleError);

async function run(): Promise<void> {
  const token = core.getInput("github-token", { required: true });
  const checks = core.getInput("checks", { required: false }).split(",");
  const octokit = getOctokit(token);

  const pull_number = parseInt(context.ref.replace("refs/pull/", "").replace("/merge",""));

  const { data: rawCommits } = await octokit.rest.pulls.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pull_number,
  });
  let commits = rawCommits.reverse();
  core.info(`Number of commits: ${commits.length}`);
  core.info(`Commits:\n${ commits.map(commit => { return commit.commit.author?.name + ": " + commit.commit.message.split("\n")[0]; }).join("\n") }`);

  let response = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pull_number,
  });
  let result = ""
  let depth = 0;
  for (const { sha, commit } of commits) {
    depth++
    core.info(`Checking commit at depth: ${depth}`);
    const {
      data: { check_runs: checkSuites },
    } = await octokit.rest.checks.listForRef({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: sha,
    });
    if (checks != null) {
      let sha = ""
      const results = [] as Boolean[];
      checks.forEach(checkName => {
        const check = checkSuites.find(
          (c) => (c.name === checkName && c.status === "completed" && c.conclusion === "success")
        )
        if (check != null) {
          sha = check.head_sha
          core.info(`Found successful check for: ${checkName}, for commit ${commit.author?.name + ": " + commit.message}`);
        }
        results.push(
          check != undefined
        )
      })
      if (results.find(e => e === false) === undefined) {
        result = sha;
        break;
      }
    } else {
      const success = checkSuites.find(
        (c) => c.status === "completed" && c.conclusion === "success"
      );
      if (success) {
        result = success.head_sha;
        break;
      }
    }
  }
  core.info(`Commit: ${result}`);

  core.setOutput("result", result);
}

run().catch(handleError);
