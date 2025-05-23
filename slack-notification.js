const args = require("minimist")(process.argv.slice(2));
const fs = require("node:fs");
const core = require('@actions/core');
const github = require('@actions/github');
require("dotenv").config();

const SLACK_GITHUB_TOKEN = process.env.SLACK_GITHUB_TOKEN;
const SLACK_GITHUB_CHANNEL = process.env.SLACK_GITHUB_CHANNEL;
const SLACK_USERS_MAP = process.env.SLACK_USERS_MAP;
const GITHUB_JSON = process.env.GITHUB_JSON;
const SALESFORCE_ORG_URL = process.env.SALESFORCE_ORG_URL;

async function getSlackMessage(prLink, prName, deployId, deploySuccess, actor, triggeringActor, status, errors, orgUrl, base, head){
  if(!orgUrl){
    console.log('!orgUrl ' + !orgUrl);
    orgUrl = 'http://login.salesforce.com';
  }

  console.log('orgUrl2 ' + orgUrl);

  let skipPmdIcon = prName.includes('--skip-pmd-check') ? '✅' : '🚫';
  prName = prName.replace('--skip-pmd-check', '')
  let deployUrl = orgUrl + '/one/one.app#/alohaRedirect/changemgmt/monitorDeploymentsDetails.apexp?asyncId=' + deployId +'&retURL=%2Fchangemgmt%2FmonitorDeployment.apexp&isdtp=p1'
  let titleMessage = deploySuccess ? 'Seu deploy foi realizado com successo! ' : "Parece que o seu deploy não deu muito certo 😔";
  let messageContent = `*<${prLink} | ${prName} >* \n *Skip PMD:* ${skipPmdIcon} \n *Deployment:* <${deployUrl} |Link>\n*Actor:* ${actor}  - *Triggering Actor:* ${triggeringActor}  \n *Status*: ${status} `;
  messageContent += `\n *From:* ${head} *To:* ${base}`
  console.log('messageContent : ' + messageContent);
  return {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "plain_text",
          "emoji": true,
          "text": titleMessage
        }
      },
      {
        "type": "divider"
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": messageContent
        },
        "accessory": {
          "type": "image",
          "image_url": "https://api.slack.com/img/blocks/bkb_template_images/notifications.png",
          "alt_text": "calendar thumbnail"
        }
      },
      {
        "type": "rich_text",
        "elements": errors
      },
      {
        "type": "divider"
      }
    ]
  };
}
function getErrors(report){
  let errors = [];
  
  report?.result?.files?.forEach( file => {
    errors.push({
      "type": "text",
      "text": `🛑 [${file.type}] ${file.fullName} : ${file.error} \n`
    })
  })
  let rich_text_errors = [{
    "type" : "rich_text_preformatted",
    "elements" : errors
  }]

  
  return rich_text_errors;
}
async function init() {
  try{
    const usersMap = JSON.parse(SLACK_USERS_MAP);
    const githubjson = JSON.parse(GITHUB_JSON);
    for(const variavel in githubjson){
      if(variavel === 'event'){
        
      }
    }
    
    let orgUrl = SALESFORCE_ORG_URL;
    let deployReport = JSON.parse(fs.readFileSync('out.txt', "utf8"));
    let deployId = deployReport.result.id;
    let deploySuccess = deployReport.result.success;
    let status = deployReport.result.status
    let errors = getErrors(deployReport);
    let prLink = 'http://salesforce.com/'
    let prTitle = githubjson.event.pull_request.title;
    let slackMessage;
    let actor = githubjson.actor;
    if(githubjson?.event_name === 'pull_request'){
      let triggeringActor = githubjson.triggering_actor;
      let head_branch = githubjson.head_ref;
      let base_branch = githubjson.base_ref;
      slackMessage = await getSlackMessage(prLink, prTitle, deployId, deploySuccess, actor, triggeringActor, status, errors, orgUrl, base_branch, head_branch)
    }

    
    let token = SLACK_GITHUB_TOKEN;
    let channel = usersMap[actor];
    const url = "https://slack.com/api/chat.postMessage";
    console.log('orgUrl : ' + orgUrl);
    if(!token || !channel){
      core.setFailed('Token ou canal inválido');
      console.log('Token ou canal inválido');
      process.exit(1);
    }
    let headers = new Headers();
    headers.set("Authorization", "Bearer " + token);
    headers.set("Content-Type", "application/json");
    const request = new Request(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        channel,
        blocks: JSON.parse(JSON.stringify(slackMessage?.blocks))
      })
    });

    const response = await fetch(request);

    const responseString = await response.text();

    if(!deploySuccess){
      
      core.setFailed('Houve um erro no deploy.');
      console.log('\n ---- ERROR SET FAILED ----');
      process.exit(1);
    }
    return console.log('deploySuccess : ' + deploySuccess + responseString);

  }catch(e){
    return console.log(e.stack);
  }
}

init();
