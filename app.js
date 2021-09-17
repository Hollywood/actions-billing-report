require('dotenv').config()
const { Octokit } = require("@octokit/rest");
const getOrgs = require('./getEnterpriseRepos')
const moment = require('moment')
const Json2csvParser = require('json2csv').Parser;
const fs = require('fs')

// Create new Octokit Instance
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  baseUrl: "https://api.github.com"
});

// Get List of Organizations for the Enterprise
const buildAuditLog = async () => {

  // Grab list of organizations from the Enterprise
  const orgs = await getOrgs(process.env.GITHUB_ENTERPRISE);

  var data = [];
  var errors = [];

  console.log(orgs.length)

  // Grab the list of repos for each organization and add to array
  for (let org of orgs) {
    const response = await octokit.paginate(octokit.rest.repos.listForOrg, {
      org: org,
      per_page: 100
    }).catch(err => {
      errors = [...errors, { org: org, repo: err.response.url, error: err }]
     });

     data = [...data, response];
  }

  console.log(data)
    
  // Grab only what we need from the response data
  const repoNames = data.map(repo => {
    if(repo.length > 0) {
     ({ org: repo.owner.login, repo: repo.name })
    }
  });

  // List the Workflow Run for each repository in repoNames
  const workflowRuns = await Promise.all(repoNames.map(async repo => {
    const response = await octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      owner: repo.org,
      repo: repo.repo,
      per_page: 100,
      created: `created:>${moment().subtract(parseInt(process.env.HISTORY_IN_DAYS), 'days').format("YYYY-MM-DD")}`
    }).catch(err => {
      errors = [...errors, { org: repo.org, repo: repo.repo, error: err }]
     });
     return response;
  }));

  // Remove Empty Array Elements
  const filteredWorkflowRuns = workflowRuns.filter(repo => repo.length > 0);

  // Get Workflow Data
  const reportData = filteredWorkflowRuns.map(workflow => workflow.map(run => ({ Organization: run.repository.owner.login, Repository: run.repository.name, WorkflowRunID: run.id, WorkflowName: run.name === '' ? 'NULL' : run.name, Committer: run.head_commit.committer.name, WorkflowRunURL: run.html_url, 
    WorkflowStarted: run.created_at, WorkflowRunTime: moment.utc(moment(new Date(run.updated_at)).diff(moment(run.created_at))).format("HH:mm:ss"), Status: run.conclusion })));

  // Flatten the array
  const flattened = reportData.reduce((a, b) => a.concat(b), []);
  
  // Create CSV File
  var stringifiedData = JSON.stringify(flattened);
  const csvHeaders = ['Organization', 'Repository', 'WorkflowRunID', 'WorkflowName', 'Committer', 'WorkflowRunURL', 'WorkflowStarted', 'WorkflowRunTime', 'Status'];
  var json2csvParser = new Json2csvParser({
    csvHeaders,
    delimiter: ';'
  })

  const csv = json2csvParser.parse(stringifiedData);
  fs.writeFile('Action_Run_Report.csv', csv, function (err) {
    if (err) throw err
    console.log('file saved!')
  })
}

buildAuditLog();