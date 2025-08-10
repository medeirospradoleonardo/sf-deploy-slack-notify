const args = require("minimist")(process.argv.slice(2));
const fs = require("node:fs");
const core = require('@actions/core');
require("dotenv").config();
const SLACK_GITHUB_TOKEN = process.env.SLACK_GITHUB_TOKEN;
const SLACK_USERS_MAP = process.env.SLACK_USERS_MAP;
const GITHUB_JSON = process.env.GITHUB_JSON;
const SALESFORCE_ORG_URL = process.env.SALESFORCE_ORG_URL;

function toTitleCase(str) {
    return str
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}

async function getSlackMessage(githubJson, deployReport, deployType, orgName) {
    const deployId = deployReport.result?.id;
    const deployUrl = SALESFORCE_ORG_URL + '/one/one.app#/alohaRedirect/changemgmt/monitorDeploymentsDetails.apexp?asyncId=' + deployId + '&retURL=%2Fchangemgmt%2FmonitorDeployment.apexp&isdtp=p1'

    const deploySuccess = deployReport.result?.success;
    const statusIcon = deploySuccess ? '🟢' : '🛑';
    const deployLabel = deployType === 'validate' ? 'Validate' : 'Deploy';

    const actor = githubJson.actor;
    const triggeringActor = githubJson.event?.pull_request?.user?.login || githubJson.event?.head_commit?.author?.username || actor;

    let prOrCommitTitle = githubJson.event.pull_request?.title ?? githubJson.event.head_commit?.message;
    prOrCommitTitle = prOrCommitTitle.replace(/\s*--\S+/g, '').trim();
    const prOrCommitUrl = githubJson.event.pull_request?.html_url ?? githubJson.event.head_commit?.url ?? '';

    const branchFrom = githubJson.event.pull_request?.head?.ref ?? githubJson.event.head_commit?.branch;
    const branchTo = githubJson.event.pull_request?.base?.ref ?? githubJson.ref_name

    const titleMessage = `${statusIcon} ${deploySuccess ? `Seu ${deployLabel} foi realizado com successo!` : `Parece que o seu ${deployLabel} não deu muito certo 😔`}`;
    const messageContent = `*<${prOrCommitUrl} | ${prOrCommitTitle} >* \n*Org:* ${SALESFORCE_ORG_URL ? `<${deployUrl} | ${toTitleCase(orgName)}>` : toTitleCase(orgName)}\n*Autor:* ${actor}\n*Autor que acionou:* ${triggeringActor}\n${!!branchFrom ? `*De:* ${branchFrom} ` : ''}${!!branchTo ? `*Para:* ${branchTo}` : ''}`;

    const blocks = [
        {
            type: "divider"
        },
        {
            type: "section",
            text: {
                type: "plain_text",
                emoji: true,
                text: titleMessage
            }
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: messageContent
            },
            accessory: {
                type: "image",
                image_url: "https://api.slack.com/img/blocks/bkb_template_images/notifications.png",
                alt_text: "calendar thumbnail"
            }
        }
    ];

    const errors = getErrors(deployReport);
    
    if (errors?.[0]?.elements?.length) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Erros encontrados:*\n`
            }
        });

        blocks.push({
            type: "rich_text",
            elements: errors
        });
    }

    const payload = { blocks };

    return payload;
}

function getErrors(report) {
    let errors = [];

    report?.result?.details?.componentFailures?.forEach(component => {
        if (!component.componentType) {
            return;
        }

        errors.push({
            type: "text",
            text: `[${component.componentType}] ${component.fullName} - ${component.problem} \n`
        });
    });

    report?.result?.details?.runTestResult?.codeCoverageWarnings?.forEach(warning => {
        errors.push({
            type: "text",
            text: `[ApexClass] ${warning.name} - ${warning.message} \n`
        });
    });

    return [{
        type: "rich_text_preformatted",
        elements: errors
    }];
}

async function init() {
    try {
        const deployType = args.deployType || 'validate';
        const orgName = args.orgName;
        const usersMap = JSON.parse(SLACK_USERS_MAP);
        const githubJson = JSON.parse(GITHUB_JSON);

        const deployReport = JSON.parse(fs.readFileSync('out.txt', "utf8"));
        const deploySuccess = deployReport.result?.success;
        const actor = githubJson.actor;

        const slackMessage = await getSlackMessage(githubJson, deployReport, deployType, orgName)

        const token = SLACK_GITHUB_TOKEN;
        const channel = usersMap[actor];
        const url = "https://slack.com/api/chat.postMessage";

        if (!token || !channel) {
            core.setFailed('Token ou canal inválido');
            console.log('Token ou canal inválido');
            process.exit(1);
        }

        const headers = new Headers();
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

        await fetch(request);

        if (!deploySuccess) {
            core.setFailed('Houve um erro no deploy.');
            process.exit(1);
        }

        return console.log('Mensagem enviada com sucesso para o Slack de ', actor);

    } catch (e) {
        return console.log(e.stack);
    }
}

init();