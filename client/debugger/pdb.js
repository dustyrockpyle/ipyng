// requires manual injection of kernel to function.

angular.module('ipy.pdb', ['ipyng', 'ng.lodash'])
  .controller('pdbCtrl', function($scope, $q, kernel, ipyKernel, _) {
    var stdoutDeferreds = [];
    var stdoutHandler = function(stream){
      if(stdoutDeferreds.length) stdoutDeferreds.pop().resolve(stream);
    };
    var stdoutPromise = function() {
      stdoutDeferreds.push($q.defer());
      return _.last(stdoutDeferreds).promise;
    };

    var promise;
    var _this = this;
    var d = {};
    $scope.debugger = d;
    d.currentFrame = null;
    d.starting = null;
    d.started = null;
    d.stack = [];
    d.args = [];
    d.locals = [];
    d.source = '';

    this.start = function(code) {
      var statement = 'import pdb\n';
      if(code) statement += 'pdb.run(' + code + ')';
      else statement += 'pdb.pm()';
      d.starting = true;
      var deferred = $q.defer();
      promise = kernel.executeStdinSilent(statement, stdoutHandler)
        .then(function(response){
          d.started = true;
          d.starting = false;
          return response;
        })
        .then(function(response){
          _this.goToFrame(0)
            .then(function(){
              deferred.resolve(true);
            });
          return response;
        });
      return deferred.promise;
    };

    var updateStack = function() {
      promise = promise
        .then(function(response){
          return response.reply('where');
        })
        .then(function(response){
          d.stack = _(response.stdout[0])
            .split('\n') // split to lines
            .reject(_.curry(_.startsWith)(_, '->', 0)) // get rid of the source lines
            .reverse() // we want the top of the stack to be zero
            .drop(1) // last value is junk
            .invoke('slice', 2) // drop the 2 character margin
            .map(function(str){ // Split into a filename, lineNumber, function
              str = str.slice(0, - 2); // chop off the function ();
              // str is in the format of {{ filename }}({{ lineNumber }}){{ function }}
              var index1 = str.lastIndexOf('(');
              var index2 = str.lastIndexOf(')');
              return {
                filename: str.slice(0, index1),
                lineNumber: str.slice(index1 + 1, index2),
                'function': str.slice(index2 + 1)
              };
            })
            .value();
          return response;
        });
    };

    var updateLocals = function(){
      promise = promise
        .then(function(response){
          return response.reply('p ' + 'list(locals().keys())');
        })
        .then(function(response) {
          var result = response.stdout[0].replace(/'/g, '"');
          d.locals = JSON.parse(result); // Ugly.
          return response;
        });
    };

    var updateArgs = function(){
      promise = promise
        .then(function(response){
          return response.reply('a');
        })
        .then(function(response){
          d.args = _(_.trim(response.stdout[0]))
            .split('\n') // split to lines
            .invoke('split', ' = ') // split to name value pairs
            .map(_.curry(_.zipObject)(['name', 'value'])) // make name, value objects
            .value();
          return response;
        });
    };

    var updateSource = function(){
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          var reply = response.reply('l 1,10000'); // Seems arbitrarily high enough for now
          var deferred = $q.defer();
          return $q.all([reply, stdoutPromise()]);
        })
        .then(function(result){
          var response = result[0];
          var stdout = result[1];
          var source = _(stdout)
            .split('\n') // split to source lines
            .invoke('substr', 6) // drop the margin characters
            .value();
          // get rid of the extra character on the current line
          var currentLine = source[d.stack[d.currentFrame].lineNumber - 1];
          source[d.stack[d.currentFrame].lineNumber - 1] = currentLine.substr(2);
          d.source = source.join('\n'); // remake the text blob
          deferred.resolve(true);
          return response;
        });
      return deferred.promise;
    };

    var evaluate = function(expression) {
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          var reply = response.reply('p ' + expression);
          return $q.all([reply, stdoutPromise()]);
        })
        .then(function(result){
          var response = result[0];
          var stdout = result[1];
          deferred.resolve({text: _.trim(response.stdout[0])});
          return response;
        });
      return deferred.promise;
    };

    this.evaluate = function(expressions){
      var resultPromises = [];
      _.forEach(expressions, function(expression){
        resultPromises.push(evaluate(expression));
      });
      return $q.all(resultPromises);
    };

    this.goToFrame = function (newFrame) {
      if(!promise) return $q.reject("Debugger not initialized");
      if(newFrame == d.currentFrame) return $q.when(true);
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          if (!d.started) return response;
          if (d.currentFrame === newFrame) return response;
          var diff = newFrame - d.currentFrame;
          if(diff > 0) return response.reply('u ' + diff);
          else return response.reply('d ' + (-diff));
        })
        .then(function(response){
          d.currentFrame = newFrame;
          updateStack();
          updateLocals();
          updateArgs();
          updateSource()
            .then(function(){
              // resolve result after everything has been updated.
              deferred.resolve(true);
            });
          return response;
        });
      return deferred.promise;
    };

    this.quit = function(){
      promise = promise
        .then(function(response){
          if(d.started) return response.reply('quit');
          return response;
        })
        .then(function(response){
          d.currentFrame = null;
          d.started = false;
          return response;
        });
    };

    $scope.$on('$destroy', function(){
      _this.quit();
    });
  });