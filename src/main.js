/*
 * The command line main() routine for the web scraper
 */

fs = require('fs');
path = require('path');
optimist = require('optimist');
Scraper = require('./scraper');

BANNER = "Usage: scrape <URL> <OutputFilename> <OutputDir>";

/*
 *
 * create directory Workspace/ThemeName if it doesn't already exist.
 * Save to PageName
 * Save all the assets of to the directory, and
 * Rewrite html to point to them
 */
exports.run = function() {
  var argv = optimist.usage(BANNER).argv;
  if (argv._.length < 2) {
    optimist.showHelp();
    return false;
  }
  
  var url = argv._[0];
  var pageName = "index.html";
  var outputDir = ".";

  if (argv._.length > 1) {
    pageName = argv._[1];
  }
  if (argv._.length > 2) {
    outputDir = argv._[2];
  }

  var opts = {
    url: url,
    filename: pageName,
    basedir: outputDir
  };

  var scraper = new Scraper(opts);
  scraper.scrape(function(error, data) {
    if (error) {
      console.log("Failure!\n");
    } else {
      console.log("\n\nSuccess!\n\n");
    }
  });
};
