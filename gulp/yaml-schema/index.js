var yaml = require('js-yaml');

var createSchema = function(rootPath) {
  var rootType = new yaml.Type('!root', {
    kind: 'scalar',
    construct: function (data) {
      return rootPath;
    }
  });

  var joinType = new yaml.Type('!join', {
    kind: 'sequence',
    construct: function (data) {
      return data.join('');
    }
  });

  var flattenType = new yaml.Type('!flatten', {
    kind: 'sequence',
    construct: function (data) {
      var result = [];
      data.forEach(function (item) {
        if (Array.isArray(item)) result = result.concat(item);
        else result.push(item);
      });
      return result;
    }
  });

  var prependType = new yaml.Type('!prepend', {
    kind: 'sequence',
    construct: function (data) {
      var prefix = data.shift();
      return data.map(function(suffix){
        return prefix + suffix;
      });
    }
  });

  var quoteType = new yaml.Type("!quote", {
    kind: 'scalar',
    construct: function(data) {
      return '"' + data + '"';
    }
  });
  return yaml.Schema.create([rootType, joinType, flattenType, prependType, quoteType]);
};

module.exports = createSchema;