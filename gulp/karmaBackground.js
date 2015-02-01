var karma = require('karma').server;
var options = JSON.parse(process.argv[2]);
karma.start(options);