// requires manual injection of kernel to function.
(function(angular){
  'use strict';

  angular.module('ipy.pdb', ['ipyng', 'ng.lodash'])
    .controller('pdbCtrl', pdbCtrl);

  function pdbCtrl ($scope, $q, kernel, _) {
    var self = this,
      stdoutDeferreds = [],
      promise = $q.when(null);

    self.currentFrame = null;
    self.starting = null;
    self.started = null;
    self.stack = [];
    self.args = [];
    self.locals = [];
    self.source = '';

    self.start = start;
    self.quit = quit;
    self.evaluate = evaluate;
    self.goToFrame = goToFrame;

    $scope.$on('$destroy', quit);

    function start (code) {
      var statement = 'import pdb\n';
      if(code) statement += 'pdb.run(' + code + ')';
      else statement += 'pdb.pm()';
      self.starting = true;
      var deferred = $q.defer();
      promise = kernel.executeStdinSilent(statement, stdoutHandler)
        .catch(function(error){
          deferred.reject(error);
          return $q.reject(error);
        })
        .then(function(response){
          self.started = true;
          self.starting = false;
          return response;
        })
        .then(function(response){
          goToFrame(0)
            .then(function(){
              deferred.resolve(true);
            });
          return response;
        });
      return deferred.promise;
    }

    function updateStack () {
      promise = promise
        .then(function(response){
          return response.reply('where');
        })
        .then(function(response){
          self.stack = _(response.stdout[0])
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
    }

    function updateLocals () {
      promise = promise
        .then(function(response){
          return response.reply('p ' + 'list(locals().keys())');
        })
        .then(function(response) {
          var result = response.stdout[0].replace(/'/g, '"');
          self.locals = JSON.parse(result); // Ugly.
          return response;
        });
    }

    function updateArgs () {
      promise = promise
        .then(function(response){
          return response.reply('a');
        })
        .then(function(response){
          self.args = _(_.trim(response.stdout[0]))
            .split('\n') // split to lines
            .invoke('split', ' = ') // split to name value pairs
            .map(_.curry(_.zipObject)(['name', 'value'])) // make name, value objects
            .value();
          return response;
        });
    }

    function updateSource () {
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          var reply = response.reply('l 1,10000'); // Seems arbitrarily high enough for now
          return $q.all([reply, makeStdoutPromise()]);
        })
        .then(function(result){
          var response = result[0];
          var stdout = result[1];
          var source = _(stdout)
            .split('\n') // split to source lines
            .invoke('substr', 6) // drop the margin characters
            .value();
          // get rid of the extra character on the current line
          var currentLine = source[self.stack[self.currentFrame].lineNumber - 1];
          source[self.stack[self.currentFrame].lineNumber - 1] = currentLine.substr(2);
          self.source = source.join('\n'); // remake the text blob
          deferred.resolve(true);
          return response;
        });
      return deferred.promise;
    }

    function evaluateSingle (expression) {
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          var reply = response.reply('p ' + expression);
          return $q.all([reply, makeStdoutPromise()]);
        })
        .then(function(result){
          var response = result[0];
          var stdout = result[1];
          deferred.resolve({text: _.trim(response.stdout[0])});
          return response;
        });
      return deferred.promise;
    }

    function evaluate (expressions) {
      var resultPromises = [];
      _.forEach(expressions, function(expression){
        resultPromises.push(evaluateSingle(expression));
      });
      return $q.all(resultPromises);
    }

    function goToFrame (newFrame) {
      if(!promise) return $q.reject("Debugger not initialized");
      if(newFrame == self.currentFrame) return $q.when(true);
      var deferred = $q.defer();
      promise = promise
        .then(function(response){
          if (!self.started) return response;
          if (self.currentFrame === newFrame) return response;
          var diff = newFrame - self.currentFrame;
          if(diff > 0) return response.reply('u ' + diff);
          else return response.reply('d ' + (-diff));
        })
        .then(function(response){
          self.currentFrame = newFrame;
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
    }

    function stdoutHandler(stream){
      if(stdoutDeferreds.length) stdoutDeferreds.pop().resolve(stream);
    }

    function makeStdoutPromise() {
      stdoutDeferreds.push($q.defer());
      return _.last(stdoutDeferreds).promise;
    }

    function quit () {
      promise = promise
        .then(function(response){
          if(self.started) return response.reply('quit');
          return response;
        })
        .then(function(response){
          self.currentFrame = null;
          self.started = false;
          return response;
        });
    }
  }
})(angular);