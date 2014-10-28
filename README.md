# zabbix-server-monitor

This is a simple, standalone NodeJS service for monitoring if a Zabbix server is really working or not. Generally used in conjunction with an outside monitoring service to know from a single check if your whole Zabbix mointoring system is working or not. The output format is the [Pingdom](https://www.pingdom.com) HTTP Custom monitoring XML format (including a status and a response time).

## How it works

This code gets a given Zabbix host's given item's last value from the Zabbix API and checks that value's reception time against the current timestamp to determine if that value is "recent enough" or not. If it's not "recent enough" or if it's cannot be obtained the script returns an answer indicating a failed Zabbix service.

## Installation

### Prerequisites

* `Node.js` (e.g. from [here](http://nodejs.org/) if you do not have it yet)
* `git`

### Actual install

1. Check out this repository: `git clone https://github.com/nightw/zabbix-server-monitor.git`
1. Install the dependencies: `npm install`
1. Run the project with a command similar to this (more details in the Usage section):
```
ZABBIX_USERNAME=user ZABBIX_PASSWORD=password ZABBIX_JSON_API_URL=https://myzabbix.domain.tld/api_jsonrpc.php PORT=8888 npm start
```
Now open an address like this in a browser: `http://localhost:8888/?hostname=zabbix-server-name-in-zabbix&itemname=Values%20processed%20by%20Zabbix%20server%20per%20second`

## Usage

### Environment variables

The following environment variables are **mandatory** for running the project:

* `ZABBIX_USERNAME` - The Zabbix user used to with the Zabbix API to get the needed data
* `ZABBIX_PASSWORD` - The password for the Zabbix user for the API access
* `ZABBIX_JSON_API_URL` - The Zabbix API URL, something that usually similar to this: `https://zabbix.domain.tld/api_jsonrpc.php`

These Environment variables are **optional**:

* `ACCEPTABLE_ITEM_AGE` - the time frame for accepting the Zabbix item value for being "current enough" given in **minutes**, default: `2`
* `PORT` - the port to run the HTTP listener for this service, default: `38888`
* `DEBUG` - if it's set to `true` or to `1` then the process will log some debug messages to the console, otherwise it's silent, default: `false`
* `NODE_TLS_REJECT_UNAUTHORIZED` - if you set it to `0` then SSL certificates will not be validated during the Zabbix API calls (not recommended!), default: `1`

### Query parameters

Please note that all of the query parameters needs to be urlencoded and the app takes care of decoding them.

These are the two mandatory query parameters:

* `hostname` - it's the name of the Zabbix Host for which we want to get an item's value, e.g.: `zabbix-server`
* `itemname` - it's the name of the item for the Host we want to check for the last collection/receive time. Currently only float type items are supported., e.g.: `Values%20processed%20by%20Zabbix%20server%20per%20second`, `Processor%20load%20(1%20min%20average%20per%20core)`

## Motivation

I'll give a little context. Currently I use Zabbix for monitoring a couple of servers with a lot of different services on them. Besides that the main services/sites are covered by [Pingdom](https://www.pingdom.com) to have a second, simpler, but outside monitoring solution. Recently I had a monitoring outage when the Zabbix VM itself went down and I was not able to detect it for a while. I tought I need an easy but sure way to monitor the Zabbix server itself (the core process, not the DB + the PHP frontend). I've searched for a solution which is capable of checking if the item values are still coming in or not, but did not found that, so I created this.

I've chosen Node.js, because I wanted to learn it. This is my first project with it, so I welcome suggestions and fixes about general stuff too. :)

## Contributing

1. Fork it!
1. Create your feature branch: `git checkout -b my-new-feature`
1. Commit your changes: `git commit -am 'Add some feature'`
1. Push to the branch: `git push origin my-new-feature`
1. Submit a pull request :)

## History

0.1.0 - First version released

## Credits

* Thanks for [Andras Ivanyi](https://github.com/andyskw) for helping with Node.js learning and reviewing the first version

## License

Code released under [the MIT license](LICENSE)
