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
var jsdom = require("jsdom");
var fs = require("fs");
var path = require("path");

/*
 * Required
 *
 *   opts.url       -  URL to scrape
 *
 * Optional
 *
 *   opts.filename  -  Name of html file to save to
 *   opts.basedir   -  Base directory in which to extract
 */
WebScraper = function(opts) {
  this.opts = opts;
  if (typeof this.opts.basedir == 'undefined') {
    this.opts.basedir = '.';
  }
  if (typeof this.opts.filename == 'undefined') {
    this.opts.filename = 'index.html';
  }
};

WebScraper.prototype.endsWith = function(s, suffix) {
  return s.indexOf(suffix, s.length - suffix.length) !== -1;
}

WebScraper.prototype.filenameForUrl = function(url, kind) {
  var uri = new Uri(url);
  var parts = uri.path().split("/");
  var filename = parts[parts.length - 1];
  if ((filename === null) || (filename.length === 0)) {
    var d = new Date();
    filename = "AutoGen_" + d.getTime();
  }

  if ((kind == 'html') && (! this.endsWith(filename, '.html'))) {
    filename = filename + '.html';
  } else if ((kind == 'js') && (! this.endsWith(filename, '.js'))) {
    filename = filename + '.js';
  } else if ((kind == 'css') && (! this.endsWith(filename, '.css'))) {
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
};

WebScraper.prototype.isRssLink = function(e) {
  return (
      (! _.isNull(e.prop('type'))) && 
      (e.prop('type').indexOf('rss') != 1)
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
WebScraper.prototype.extractFilespec = function(jqElem, fixToo) {
  var ret = {};
  if (jqElem.is('link')) {
    ret.binary = false;
    ret.url = jqElem.attr('href');
    ret.linkedFrom = this.opts.url;

    // Determine type.
    if (this.isCssLink(jqElem)) {
      ret.type = 'css';
      ret.localUrl = 'css/' + this.filenameForUrl(ret.url);
    } else if (this.isRssLink(jqElem)) {
      ret.type = 'rss';
      ret.localUrl = 'rss/' + this.filenameForUrl(ret.url);
    } else {
      // We're going to put it in the other category. But first we'll try some common
      // image formats.
      if ((this.endsWith(ret.url, 'png')) ||
          (this.endsWith(ret.url, 'jpg')) ||
          (this.endsWith(ret.url, 'gif'))) {
        ret.type = 'image';
        ret.localUrl = 'images/' + this.filenameForUrl(ret.url);
        ret.binary = true;
      } else {
        ret.type = 'other';
        ret.localUrl = 'other/' + this.filenameForUrl(ret.url);
      }
    }
    if (fixToo) {
      jqElem.attr('href', ret.localUrl);
    }
  } else if (jqElem.is('img')) {
    ret.binary = true;
    ret.url = jqElem.attr('src');
    ret.type = 'image';
    ret.localUrl = 'images/' + this.filenameForUrl(ret.url);
    if (fixToo) {
      jqElem.attr('src', ret.localUrl);
    }
  } else if (jqElem.is('script')) {
    ret.binary = false;
    ret.url = jqElem.attr('src');
    if (_.isUndefined(ret.url) || ret.url === null || ret.url == '') {
      ret = null;
    } else {
      ret.type = 'js';
      ret.localUrl = 'js/' + this.filenameForUrl(ret.url);
      if (fixToo) {
        jqElem.attr('src', ret.localUrl);
      }
    }
  }
  if (ret != null) {
    ret.linkedFrom = this.opts.url;
  }
  return ret;
}

/**
 * Rewrites HTML such that all images are
 */
WebScraper.prototype.queueAndSaveAssets = function(html, success, failure) {
  this.assetQueue = [];
  var self = this;

  var considerElement = function(jqelem) {
    var fileSpec = self.extractFilespec(jqelem, true);
    if (fileSpec !== null) {
      self.assetQueue.push(fileSpec);
    }
  }

  /*
   * Queue up all the assets to download
   */
  jsdom.env({
    html: html,
    scripts: ["http://ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min.js"],
    done: function(errors, window) {
      if (errors) {
        failure(errors);
      } else {
        // Walk the DOM and get each asset.
        var $ = window.$;
        _.each($('img'), function(elem) { considerElement($(elem)) });
        _.each($('script'), function(elem) { considerElement($(elem)) });
        _.each($('link'), function(elem) { considerElement($(elem)) });
        // Stash 'em away. Thar be ajax acomin'.
        self.fixedHtml = window.document.documentElement.innerHTML;
        self.queueAndSaveSuccess = success;
        self.queueAndSaveFailure = failure;
        self.saveAsset();
      } // if no errors
    } // done
  });
};

WebScraper.prototype.saveAsset = function() {
  if (this.assetQueue.length == 0) {
    this.queueAndSaveSuccess(this.fixedHtml);
  } else {
    // pop one off
    var asset = this.assetQueue[0];
    FetchUrl(asset, this.saveAssetSuccess, this.saveAssetFailure, undefined, this);
  }
};

WebScraper.prototype.saveAssetSuccess = function(data) {
  var asset = this.assetQueue.shift();
  try {
    var filename = path.join(this.opts.basedir, asset.localUrl);
    // Ensure the path
    var pathname = path.dirname(filename);
    if (! fs.existsSync(pathname)) {
      fs.mkdirSync(pathname);
    }
    fs.writeFileSync(filename, data, "utf8");
  } catch (e) {
    //console.log("Failed to save asset to disk");
    //console.log(e);
  }
  this.saveAsset();
};

WebScraper.prototype.saveAssetFailure = function(e) {
  // Well.. nothing much can be done. We're not going to
  // hard fail here because so many sites have broken links.
  //console.log("Failed to download asset");
  //console.log(e);
  this.assetQueue.shift();
  this.saveAsset();
}

WebScraper.prototype.savePage = function(html) {
  fs.writeFileSync(path.join(this.opts.basedir, this.opts.filename), html, "utf8");
};

WebScraper.prototype.scrape = function(success, failure) {
  // Create the Workspace directory if it doesn't exist
  if (! fs.existsSync(this.opts.basedir)) {
    fs.mkdirSync(this.opts.basedir);
  }

  FetchUrl(this.opts.url,
    function(html) {
      this.queueAndSaveAssets(html,
        function(fixedHtml) {
          this.savePage(fixedHtml);
          success();
        },
        function(err) {
          failure(err);
        }
      );
    }, function(err) {
      failure(err);
    },
    'utf-8',
    this
  );
};

module.exports = WebScraper;
