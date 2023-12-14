const axios = require('axios');
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const json = require('koa-json');
const Router = require('koa-router');
const ejs = require('ejs');
const serverless = require('aws-serverless-koa').default;
const fs = require('fs');
const snekfetch = require('snekfetch');

const app = new Koa();
const router = new Router();
const urlsFilePath = 'urls.json';
let urls = [];

try {
  const urlsFileContent = fs.readFileSync(urlsFilePath);
  urls = JSON.parse(urlsFileContent);
} catch (error) {
  console.error(`Error reading URLs file: ${error}`);
}

const heartbeatInterval = 60 * 1000;

let lastStatuses = {};

const pingUrl = async (url) => {
  try {
    const res = await axios.get(url);
    if (res.status === 200) {
      if (!lastStatuses[url] || lastStatuses[url].status !== res.status) {
        console.log(`[ OK ] ${url} is working\nStatus code: ${res.status}\nHeartbeat: ${new Date().toISOString()}\n`);
      }
      lastStatuses[url] = {
        status: res.status,
        uptime: lastStatuses[url] ? lastStatuses[url].uptime + heartbeatInterval : heartbeatInterval
      };
    } else {
      if (!lastStatuses[url] || lastStatuses[url].status !== res.status) {
        console.error(`[ERROR] ${url} returned status code ${res.status}`);
      }
      lastStatuses[url] = {
        status: res.status,
        uptime: lastStatuses[url] ? lastStatuses[url].uptime : 0
      };
    }
  } catch (error) {
    if (!lastStatuses[url] || lastStatuses[url].status !== null) {
      console.error(`[ERROR] ${url} could not be reached:\n${error}`);
    }
    lastStatuses[url] = {
      status: null,
      uptime: lastStatuses[url] ? lastStatuses[url].uptime : 0
    };
  }
};

router.get('/', async (ctx) => {
  const responseData = {
    message: 'Ping bot is up and running',
    urls: urls.map(url => {
      return {
        name: url.name,
        url: url.url,
        status: lastStatuses[url.url] ? lastStatuses[url.url].status : null,
        lastChecked: new Date().toISOString(),
        uptime: lastStatuses[url.url] ? lastStatuses[url.url].uptime / 1000 + ' seconds' : null
      }
    }),
    timestamp: new Date().toISOString(),
  };
  const html = await ejs.renderFile('index.ejs', responseData);
  ctx.body = html;
});

router.get('/api/ping', async (ctx) => {
  const { name, url } = ctx.request.query;

  if (!name || !url) {
    ctx.status = 400;
    ctx.body = { error: 'Both the "name" and "url" parameters are required.' };
    return;
  }

  if (name.includes(' ') || !isValidUrl(url)) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid format for "name" or "url" parameter. Please ensure there are no spaces in the name and enter a valid URL.' };
    return;
  }

  const existingUrl = urls.find((u) => u.url === url);
  if (existingUrl) {
    ctx.status = 400;
    ctx.body = { error: 'The specified URL already exists in the monitored list.' };
    return;
  }

  const existingName = urls.find((u) => u.name === name);
  if (existingName) {
    ctx.status = 400;
    ctx.body = { error: 'The specified name already exists. Please choose another name.' };
    return;
  }

  urls.push({ name, url });
  fs.writeFileSync(urlsFilePath, JSON.stringify(urls));
  ctx.status = 200;
  ctx.body = { message: `The URL "${url}" has been added to the monitored list with the name "${name}"` };
});

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

const pingAllUrls = () => {
  urls.forEach((url) => pingUrl(url.url));
};

app
  .use(json())
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

setInterval(pingAllUrls, 1000);
setInterval(pingAllUrls, heartbeatInterval);

app.listen(3000);

console.log('====================================================');
console.log('      BotScope: Bot Performance Monitoring          ');
console.log('====================================================');
console.log('URLs being monitored:');
console.log('----------------------------------------------------');
urls.forEach((url) => {
  console.log(`${url.name.padEnd(10)} ${url.url.padEnd(30)}`);
});
console.log('====================================================\n');
