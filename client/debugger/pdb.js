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

    $scope.currentFrame = null;
    var actualFrame = null;
    $scope.debuggerStarting = false;
    $scope.debuggerStarted = false;
    $scope.stack = [];
    $scope.args = [];
    $scope.locals = [];
    $scope.source = '';

    this.start = function(code) {
      var statement = 'import pdb\n';
      if(code) statement += 'pdb.run(' + code + ')';
      else statement += 'pdb.pm()';
      $scope.debuggerStarting = true;
      promise = kernel.executeStdinSilent(statement, stdoutHandler)
        .then(function(response){
          $scope.debuggerStarted = true;
          $scope.debuggerStarting = false;
          return response;
        })
        .then(function(response){
          $scope.currentFrame = 0;
          return response;
        });
    };

    var updateStack = function() {
      promise = promise
        .then(function(response){
          return response.reply('where');
        })
        .then(function(response){
          $scope.stack = _(response.stdout[0])
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
          $scope.locals = JSON.parse(result); // Ugly.
          return response;
        });
    };

    var updateArgs = function(){
      promise = promise
        .then(function(response){
          return response.reply('a');
        })
        .then(function(response){
          $scope.args = _(_.trim(response.stdout[0]))
            .split('\n') // split to lines
            .invoke('split', ' = ') // split to name value pairs
            .map(_.curry(_.zipObject)(['name', 'value'])) // make name, value objects
            .value();
          return response;
        });
    };

    var updateSource = function(){
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
          var currentLine = source[$scope.stack[$scope.currentFrame].lineNumber - 1];
          source[$scope.stack[$scope.currentFrame].lineNumber - 1] = currentLine.substr(2);
          $scope.source = source.join('\n'); // remake the text blob
          return response;
        });
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

    var updateFrame = function () {
      if(!promise) return;
      var newFrame = $scope.currentFrame;
      promise = promise
        .then(function(response){
          if (actualFrame === null) return response;
          if (actualFrame === newFrame) return response;
          var diff = newFrame - actualFrame;
          if(diff > 0) return response.reply('u ' + diff);
          else return response.reply('d ' + (-diff));
        })
        .then(function(response){
          actualFrame = newFrame;
          updateStack();
          updateLocals();
          updateArgs();
          updateSource();
          return response;
        });
    };

    $scope.$watch('currentFrame', updateFrame);

    this.quit = function(){
      promise = promise
        .then(function(response){
          if($scope.debuggerStarted) return response.reply('quit');
          return response;
        })
        .then(function(response){
          actualFrame = null;
          $scope.currentFrame = null;
          $scope.debuggerStarted = false;
          return response;
        });
    };

    $scope.$on('$destroy', function(){
      _this.quit();
    });
  });