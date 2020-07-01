const fs = require("fs");
const path = require('path');
const exec = require('@actions/exec');
const core = require("@actions/core");
const github = require("@actions/github");

async function annotationGenerate(accessToken, annotations) {
    const octokit = new github.getOctokit(accessToken);
    const req = {
      ...github.context.repo,
      ref: "b3f4f26d7f8340f6d3f59cfda712d98f45024712",
    };
    console.log(JSON.stringify(req));
    // if (github.context.payload['pull_request']) {
    //   req.ref = github.context.payload.pull_request.head.sha
    // }
    const res = await octokit.checks.listForRef(req);
    const jobName = process.env.GITHUB_JOB;
    console.log("=======================++++================");
    console.log(JSON.stringify(github.context));
    console.log("=======================----================");
    console.log(JSON.stringify(res.data));
    const checkRun = res.data.check_runs.find(
      (check) => check.name === jobName
    );
    if (!checkRun) {
      console.log("current job++: " + jobName);
      console.log(
        "Can happen when performing a pull request from a forked repository."
      );
      return;
    }
    const check_run_id = checkRun.id;
    // const check_run_id = github.context.runId;

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

async function run() {
    try {
        let annotations = [];
        const skipList = core.getInput('skip');
        const accessToken = core.getInput("access-token");
        const radar = path.resolve(__dirname, '..', 'bin', 'g11n-radar')
        const project =  process.cwd()
        const report = path.resolve(project, 'report.json')
        console.log("parameter: " + skipList)
        console.log("radar: " + radar)
        console.log("project: " + project)
        const skips = skipList.split(',')
        await exec.exec(radar, ['-p', project, '-d', report, 'rule', '--skip', 'bundlegen/', ...skips]);
        const data = await fs.promises.readFile(report);
        var json = JSON.parse(data);
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
        await annotationGenerate(accessToken, annotations)
    } catch (error) {
        core.setFailed(error.message);
    }
}

run()