import {
  Meteor
} from 'meteor/meteor';
const _ = require("lodash")
const fs = require('fs')
const scrapeIt = require("scrape-it")
const puppeteer = require('puppeteer');
/*
  Project Specifics
*/
// Public Directory Path
var path = process.env['METEOR_SHELL_DIR'] + '/../../../public/';
let root = 'https://www.swissmedic.ch';
let swissList = 'https://www.swissmedic.ch/swissmedic/de/home/humanarzneimittel/marktueberwachung/qualitaetsmaengel-und-chargenrueckrufe/chargenrueckrufe.html';
let qa = 'https://www.swissmedic.ch/swissmedic/de/home/humanarzneimittel/marktueberwachung/health-professional-communication--hpc-.html';
/*
  ===
*/
Swiss = {}
/*
  Collections (DB)
*/
Items = new Mongo.Collection('items')
Logs = new Mongo.Collection('logs')
/*
  Basic App Actions

*/
Swiss.patch = (data,type,lang)=>{
  _.each(data,(item)=>{
    let isExist = Items.findOne({title:item.title})
    let exclude = ["KPA Breakout Session – Präsentationen","Newsdienste – Newsletter abonnieren"]
    if(!isExist && exclude.indexOf(item.title) == -1){
      item.type = type;
      item.lang = lang;
      item.url = root + item.url;
      var id = Items.insert(item)
      Swiss.scrapDrug(item.url,id)
    }
  })
}
/* 
  Write file to Disk
  => ('/export/FILENAME',data)
*/
Swiss.writeFile = (file, data) => {
  fs.writeFile(path + file, data, (err) => {
    if (err) console.log(err);
    console.log("Successfully Written to File./", file);
  });
}
/* 
  Get Exported Files
  => [file1,file2]
*/
Swiss.getFiles = (dir) => {
  if (!dir) return;
  return fs.readdirSync(path + dir)
}
/*
  getItems
    - Fetch collection with certain values
*/
Swiss.getItems = (type,lang) =>{
  return Items.find({lang:lang,type:type}).fetch()
}

/*
  Custom Single Link Scrapper 
    - Puppeteer is NOT required
*/
Swiss.scrapDrug = (url,id)=>{
  scrapeIt(url, {
    title: ".mod h1",
    date: '.mod-headline h5',
    desc: ".mod-text article",
    pdf: {
      selector: ".mod-download a",
      attr: "href"
    },
    prep: {
      listItem: '.table-simple tr',
      data: {
        prop: {
          selector: ':nth-child(1)'
        },
        field: {
          selector: ':nth-child(2)'
        }
      }
    }
  }).then(({
    data,
    response
  }) => {
    console.log(`Scrapping:`, data.title)
    console.log(`Scrapping status: ${response.statusCode}`)
    data.pdf = root + data.pdf
    Items.update({_id:id},{$set:data})
  })
}

/*
  Runner
*/
Swiss.run = ()=>{
  scrapper(swissList,'drug','de')
  scrapper(qa,'doc','de')

}

Swiss.record = ()=>{
  Swiss.writeFile('/exports/drugs-de.json',JSON.stringify(Swiss.getItems('drug','de')))
  Swiss.writeFile('/exports/doc-de.json',JSON.stringify(Swiss.getItems('doc','de')))
  Meteor.setTimeout(function(){
    Swiss.close()
  },5000)
}

Swiss.close = function(){
  process.exit(0)
  //process.kill(process.pid)
}
/*
  Pupeeter Scrapper
*/
let scrapper = async (url, type, lang) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: 'load'
  });
  await page.waitForSelector(".mod-teaser")
  for (var i = 1; i < 6; i++) {
    if (i !== 1) {
      await page.click('a[data-loadpage = "' + i + '"]');
      await page.waitFor(3000);
    }
    const dimensions = await page.evaluate(() => {
      var nav = document.querySelectorAll('a[data-loadpage]')
      var ax = document.querySelectorAll('.mod-teaser')
      var title = document.querySelectorAll('.mod-teaser a')
      var items = []
      var nav = [].map.call(nav, a => a.getAttribute("data-loadpage"));
      var nav = nav.filter(function (e) {
        return e !== 0
      })
      var nav = nav.filter((x, i, a) => a.indexOf(x) == i)
      for (var i = 0; i < ax.length; i++) {    
        items.push({
          title: title[i].innerHTML,
          url: title[i].getAttribute('href')
        })
      }
      return {
        items: items,
        nav: nav,
      };
    });
    //_.each(docs)
    if(dimensions.items && dimensions.items.length){
      Swiss.patch(dimensions.items,type,lang)
    }
    
    if(dimensions && dimensions.items){
      console.log('Scrapped Items:', dimensions.items.length);
    }
  }
  await browser.close();
  Swiss.record()
  console.log("async got executed");
}
/*
  Methods
*/
Meteor.methods({
  getFiles() {
    return Swiss.getFiles('exports')
  },
  getLatest() {},
  getStats(){},
  fileDownload() {}
})
/*

*/

Meteor.startup(function(){
  Swiss.run()
})
/*
  CronJobs
*/
SyncedCron.add({
  name: 'Crunch some important numbers for the marketing department',
  schedule: function (parser) {
    return parser.text('every 12 hours');
  },
  job: function () {
    console.log('Running......')
    Swiss.run()
  }
});
SyncedCron.start();
/*
  Test
*/
Meteor.publish(null,function(){
  return Items.find({},{limit:10})
})

if (process.pid) {
  console.log('This process is your pid ' + process.pid);
}