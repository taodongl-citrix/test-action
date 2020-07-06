const fs = require("fs");
const path = require('path');
const exec = require('@actions/exec');
const core = require("@actions/core");
const github = require("@actions/github");
const artifact = require('@actions/artifact');

async function generateAnnotation(octokit, json) {
  let annotations = [];
  const annotation_level = json.errors > 0 ? "failure" : "notice";
  const annotation = {
    path: "g11n-radar",
    start_line: 0,
    end_line: 0,
    start_column: 0,
    end_column: 0,
    annotation_level,
    message: `G11n radar ${json.errors} Errored`,
  };
  if (json.errors > 0 || json.warnings > 0) {
    for (const issue of json.issues) {
      annotations.push({
        path: issue.file,
        start_line: issue.position.startLine,
        end_line: issue.position.endLine,
        start_column: issue.position.startColumn,
        end_column: issue.position.endColumn,
        annotation_level: "failure",
        message: issue.context,
      });
    }
  }
  annotations = [annotation, ...annotations];

  const req = {
    ...github.context.repo,
    ref: github.context.sha,
  };
  const res = await octokit.checks.listForRef(req);
  const jobName = process.env.GITHUB_JOB;
  const checkRun = res.data.check_runs.find(check => ((check.name === jobName) && (check.status !== 'completed')));
  if (!checkRun) {
    core.warning("Can happen when performing a pull request from a forked repository.");
    return;
  }
  const check_run_id = checkRun.id;

  const update_req = {
    ...github.context.repo,
    check_run_id,
    output: {
      title: "G11n Radar Results",
      summary: "G11n Radar Results",
      annotations,
    },
  };
  await octokit.checks.update(update_req);
}

async function generateReviews(octokit, json) {
  const pull_number = github.context.payload.pull_request.number;
  const req = {
    ...github.context.repo, // owner & repo
    pull_number, 
    event: 'COMMENT',
    body: 'Please fix g11n issues\nContact Globalization team in https://citrix.slack.com/archives/CJKDCKS4B for more information',
  }
  await octokit.pulls.createReview(req);
}

async function handleEvent(accessToken, json) {
  const octokit = new github.getOctokit(accessToken);
  if (github.context.eventName === 'push') {
    // add annotations
    await generateAnnotation(octokit, json);
  } else if (github.context.eventName === 'pull_request') {
    // This action will not currently work for pull requests from forks 
    // -- like is common in open source projects
    // -- because the token for forked pull request workflows does not have write permissions.
    if (!github.payload.pull_request.head.fork) {
      // review comments
      await generateReviews(octokit, json);
    }
  }
}

async function run() {
  try {
    const skipList = core.getInput('skip');
    let accessToken = core.getInput("repoToken");
    console.log("access token: " + accessToken);
    if (!accessToken) {
      core.setFailed('cannot get accessToken');
      return;
    }
    const radar = '/opt/radar/bin/g11n-radar'
    const project =  process.cwd();
    const report = path.resolve(project, 'report.json');
    core.debug("project: " + project);
    const skips = skipList.split(',');
    await exec.exec(radar, ['-p', project, '-d', report, 'rule', '--skip', 'bundlegen/', ...skips]);
    const data = await fs.promises.readFile(report);
    var json = JSON.parse(data);
    if (json.errors == 0) {
      return;
    } else {
      const artifactClient = artifact.create();
      await artifactClient.uploadArtifact("g11n-result", [report], project);
      console.log('Contact Globalization team in https://citrix.slack.com/archives/CJKDCKS4B for more information');
      await handleEvent(accessToken, json);
      core.setFailed('g11n issues exist');
    }
  } catch (error) {
    core.setFailed(error);
  }
}

run();
