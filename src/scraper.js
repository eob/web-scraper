/**
 * Scraping proceeds in a few steps.
 * 1. Grab the HTML file
 * 2. Grab each asset the HTML file references
 * 3. Rewrite all paths in the HTML file to the new local directory structure
 * 4. Save all the assets
 */

var Uri = require("jsuri");
var FetchUrl = require("fetch-url");
var _ = require("underscore");

function WebScraper = function() {
};

WebScraper.prototype.endsWith(s, suffix) {
  return s.indexOf(suffix, s.length - suffix.length) !== -1;
}

WebScraper.prototype.filenameForUrl = function(url, kind) {
  var uri = new WebScraper.Uri(url);
  var parts = uri.path().split("/");
  var filename = parts[parts.length - 1];
  if ((filename === null) || (filename.length === 0)) {
    var d = new Date();
    filename = "AutoGen_" + d.getTime();
  }

  if ((kind == 'html') && (! WebScraper.endsWith(filename, '.html'))) {
    filename = filename + '.html';
  } else if ((kind == 'js') && (! WebScraper.endsWith(filename, '.js'))) {
    filename = filename + '.js';
  } else if ((kind == 'css') && (! WebScraper.endsWith(filename, '.css'))) {
    filename = filename + '.css';
  }

  return filename;
};

WebScraper.prototype.isCssLink = function(e) {
  return (
    (
       (! _.isNull(e.prop('type'))) && 
       (e.prop('type').indexOf('css') != -1)
    ) || (
       (! _.isUndefined(e.attr('rel'))) && 
       (e.attr('rel') == 'stylesheets')
    )
  );
}

/*
 * Given an HTML element that references a file, returns an object
 * with the following properties:
 *  url: The file url
 *  localUrl: A localized file url
 *  binary: true/false
 *  type: image, css, etc etc
 */
WebScraper.prototype.extractFilespec = function(jqElem) {
  var ret = {};
  if (jqElem.is('link')) {
    ret.binary = false;
    ret.url = jqElem.attr('href');

    // Determine type.
    if (WebScraper.isCssLink(jqElem)) {
      ret.type = 'css';
      ret.localUrl = 'css/' + WebScraper.filenameForUrl(ret.url);
    } else {
      ret.type = 'other';
      ret.localUrl = 'other/' = WebScraper.filenameForUrl(ret.url);
    }
  } else if (jqElem.is('img')) {
    ret.binary = true;
    ret.url = jqElem.attr('src');
    ret.type = 'image';
    ret.localUrl = 'images/' + WebScraper.filenameForUrl(ret.url);
  } else if (jqElem.is('script')) {
    ret.binary = false;
    ret.url = jqElem.attr('src');
    if (_.isUndefined(ret.url) || ret.url === null || ret.url == '') {
      ret = null;
    } else {
      ret.type = 'js';
      ret.localUrl = 'js/' + WebScraper.filenameForUrl(ret.url);
    }
  }
  return ret;
}

/**
 * Rewrites HTML such that all images are
 */
WebScraper.prototype.rewritePage = function(html) {
}

WebScraper.prototype.saveAssets = function(html, opts, success, failure) {
  this.assetQueue = [];

  // Fill up the asset queue
  jsdom.env({
    html: html,
    scripts: ["http://ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min.js"],



};

WebScraper.prototype.savePage = function(html, opts) {
};

WebScraper.prototype.scrape = function(opts, succes, failure) {
  FetchUrl(opts.url,
    function(html) {
      this.saveAssets(html, opts,
        function() {
          var fixedHtml = this.rewritePage(html);
          this.savePage(fixedHtml, opts);
          success();
        },
        function(err) {
          failure(err);
        }
      );
    }, function(err) {
      failure(err);
    }
  );
};

module.exports = WebScraper;
