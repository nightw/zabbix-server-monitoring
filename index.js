#!/usr/bin/env node

var http = require('http');
var url =  require('url');

var Zabbix = require('zabbix');
var Q = require('q');

var pingdom_xml_template =
'<pingdom_http_custom_check>' +
'    <status>$STATUS</status>' +
'    <response_time>$RESPONSE_TIME</response_time>' +
'</pingdom_http_custom_check>'
;

// Global variables used for setting up stuff from ENV variables and use them
// accross the whole application
var acceptable_item_age;
var debug;
var zabbix;
// The amount of time for keeping the Zabbix auth token, host_id and item_id in cache
// stored in milliseconds
var cache_zabbix_for = 10*60*1000;

// Initialize a global variable used for caching Zabbix auth token and some
// answers
var zabbix_cache;

function create_xml(status, response_time) {
  return pingdom_xml_template.replace('$STATUS', status).replace('$RESPONSE_TIME', response_time);
}

function log(message) {
  if (debug) {
    console.log(message);
  }
}

function get_api_version(input) {
  var deferred = Q.defer();
  if (zabbix_cache == null || zabbix_cache.last_cache_time < Date.now() - cache_zabbix_for || zabbix_cache.zabbix == null) {
    log("Doing Zabbix API version request and caching the resulting object");
    input.zabbix = zabbix;
    zabbix.getApiVersion(function (err, resp, body) {
      if (!err) {
        zabbix_cache = {"zabbix": input.zabbix};
        zabbix_cache.last_cache_time = Date.now();
        deferred.resolve(input);
      } else {
        deferred.reject("Api version get failed: " + JSON.stringify(err));
      }
    });
  } else {
    log("Using cached Zabbix object instead of doing the Zabbix API version request");
    input.zabbix = zabbix_cache.zabbix;
    deferred.resolve(input);
  }

  return deferred.promise;
}

function authenticate(input) {
  var deferred = Q.defer();

  if (zabbix_cache == null || zabbix_cache.last_cache_time < Date.now() - cache_zabbix_for || zabbix_cache.zabbix == null || zabbix_cache.zabbix.authid == null) {
    log("Doing Zabbix authenticate request and caching the resulting object");
    input.zabbix.authenticate(function (err, resp, body) {
      if (!err) {
        zabbix_cache = {"zabbix": input.zabbix};
        zabbix_cache.last_cache_time = Date.now();
        deferred.resolve(input);
      } else {
        deferred.reject("Authentication failed: " + JSON.stringify(err));
      }
    });
  } else {
    log("Using cached Zabbix object instead of doing the Zabbix authenticate request");
    deferred.resolve(input);
  }

  return deferred.promise;
}

function get_host_id_and_item_id(input) {
  var deferred = Q.defer();

  if (zabbix_cache == null || zabbix_cache.last_cache_time < Date.now() - cache_zabbix_for || zabbix_cache["hostname_" + input.hostname] == null || zabbix_cache["itemname_" + input.itemname] == null) {
    log("Doing Zabbix get host request to get host_id and item_id and caching the resulting object");
    input.zabbix.call("host.get",
      {
        "selectItems": ["itemid", "name"],
        "filter": { "host": input.hostname },
        "output": "shorten"
      }
      ,function (err, resp, body) {
        if (!err) {
          // First look for host_id
          if (body.result[0].hostid != null) {
            input.host_id = body.result[0].hostid;
            zabbix_cache["hostname_" + input.hostname] = body.result[0].hostid;
            zabbix_cache.last_cache_time = Date.now();
          } else {
            deferred.reject("Host id was not found in the answer: " + JSON.stringify(body.result));
          }
          // Then look for item_id
          if (body.result[0].items != null) {
            for (var i = 0, len = body.result[0].items.length; i < len; i++) {
              if (body.result[0].items[i].name === input.itemname) {
                input.item_id = body.result[0].items[i].itemid;
                zabbix_cache["itemname_" + input.itemname] = body.result[0].items[i].itemid;
                zabbix_cache.last_cache_time = Date.now();
                deferred.resolve(input);
                break;
              }
            }
            deferred.reject("Item id for the given name was not present in the answer: " + JSON.stringify(body.result[0].items));
          } else {
            deferred.reject("Item ids were not present in the answer: " + JSON.stringify(body.result));
          }
        } else {
          deferred.reject("Error response for the host get request: " + JSON.stringify(err));
        }
      });
  } else {
    log("Using cached host_id and item_id instead of doing the Zabbix host request");
    input.host_id = zabbix_cache["hostname_" + input.hostname];
    input.item_id = zabbix_cache["itemname_" + input.itemname];
    deferred.resolve(input);
  }

  return deferred.promise;
}

function get_last_value(input) {
  var deferred = Q.defer();

  input.zabbix.call("history.get",
    {
      "history": 0,
      "hostids" : input.host_id,
      "itemids" : input.item_id,
      "limit" : 1,
      "sortfield": "clock",
      "sortorder": "DESC"
    }
    ,function (err, resp, body) {
      if (!err) {
        if (body.result[0].clock != null) {
          log("Got last value's timestamp from Zabbix: " + body.result[0].clock);
          deferred.resolve(body.result[0].clock);
        } else {
          deferred.reject("Item's last value's timestamp was not found in the answer: " + JSON.stringify(body.result));
        }
      } else {
        deferred.reject("Getting item history failed: " + JSON.stringify(err));
      }
    });

  return deferred.promise;
}

function zabbix_get_last_value(hostname, itemname, callback, err) {

  get_api_version({"hostname": hostname, "itemname": itemname})
    .then(authenticate, err)
    .then(get_host_id_and_item_id, err)
    .then(get_last_value, err)
    .then(callback, err);

}

var server = http.createServer(function(req, res) {
  var current_time = Date.now();
  var parsed_url = url.parse(req.url, true);
  if (parsed_url.query.hostname != null && parsed_url.query.itemname != null) {
    zabbix_get_last_value(parsed_url.query.hostname, parsed_url.query.itemname,
    function success(last_value) {
      res.setHeader("Content-Type", "text/xml");
      if (last_value > (Math.round(Date.now()/1000) - acceptable_item_age*60) ) {
        res.statusCode = 200;
        res.end(create_xml("OK", Date.now() - current_time));
      } else {
        res.statusCode = 200;
        res.end(create_xml("VALUE_TOO_OLD", Date.now() - current_time));
      }
    },
    function error(error) {
      console.error(error);
      res.setHeader("Content-Type", "text/xml");
      res.statusCode = 503;
      res.end(create_xml("ERROR_DURING_PROCESSING", Date.now() - current_time));
    });
  } else {
    res.statusCode = 400;
    res.end("Bad request. All of the following query parameters are required: hostname, itemname");
  }
});

function init(callback) {
  if (process.env.ZABBIX_USERNAME == null) {
    callback(new Error("ZABBIX_USERNAME ENV variable is not set!"));
  } else if (process.env.ZABBIX_PASSWORD == null) {
    callback(new Error("ZABBIX_PASSWORD ENV variable is not set!"));
  } else if (process.env.ZABBIX_JSON_API_URL == null) {
    callback(new Error("ZABBIX_JSON_API_URL ENV variable is not set!"));
  }

  if (process.env.ACCEPTABLE_ITEM_AGE == null) {
    acceptable_item_age = 2;
  } else {
    acceptable_item_age = parseInt(process.env.ACCEPTABLE_ITEM_AGE);
  }
  if ( acceptable_item_age !== parseInt(acceptable_item_age) ) {
    callback(new Error("ACCEPTABLE_ITEM_AGE ENV variable is set to invalid value (not an integer): " + process.env.ACCEPTABLE_ITEM_AGE));
  }

  if (process.env.DEBUG != null && (process.env.DEBUG == "true" || process.env.DEBUG == "1")) {
    debug = true;
  } else {
    debug = false;
  }

  if (process.env.PORT == null ) {
    var port = 38888;
  } else {
    var port = parseInt(process.env.PORT);
  }
  if (port !== parseInt(port)) {
    callback(new Error("PORT ENV variable is set to invalid value (not an integer): " + process.env.PORT));
  }
  zabbix = new Zabbix(process.env.ZABBIX_JSON_API_URL, process.env.ZABBIX_USERNAME, process.env.ZABBIX_PASSWORD);
  callback(null, port);
}

init(function start(err, port){
  if (err) {
    console.error("Error during starting the app: " + err);
  } else {
    server.listen(port);
  }
});
