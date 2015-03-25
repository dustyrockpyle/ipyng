// requires manual injection of kernel to function.

angular.module('ipy.pdb', ['ipyng'])
  .controller('pdbCtrl', function($scope, $q, kernel, ipyKernel) {
    var stdoutDeferreds = [];
    var stdoutHandler = function(stream){
      if(stdoutDeferreds.length) stdoutDeferreds.pop().resolve(stream);
    };
    var promise;
    var _this = this;

    $scope.currentFrame = null;
    var actualFrame = null;
    $scope.starting = false;
    $scope.started = false;
    $scope.stack = [];
    $scope.args = [];
    $scope.locals = [];
    $scope.source = '';

    this.start = function(code) {
      var statement = 'import pdb\n';
      if(code) statement += 'pdb.run(' + code + ')';
      else statement += 'pdb.pm()';
      $scope.starting = true;
      promise = kernel.executeStdinSilent(statement, stdoutHandler)
        .then(function(response){
          $scope.started = true;
          $scope.starting = false;
          return response;
        })
        .then(function(response){
          $scope.currentFrame = 0;
          return response;
        });
    };

    var updateStack = function() {
      var deferred = $q.defer();
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
          deferred.resolve($scope.stack);
          return response;
        });
      return deferred.promise;
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
          stdoutDeferreds.push(deferred);
          return $q.all([reply, deferred.promise]);
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

    this.evaluate = function(expression){
      promise = promise
        .then(function(response){
          return response.reply('p ' + expression);
        })
        .then(function(response){
          $scope.expressions[expression] = _.trim(response.stdout[0]);
          return response;
        });
    };

    var updateFrame = function () {
      if(!$scope.started) return;
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
      if($scope.started) {
        promise = promise
          .then(function(response){
            return response.reply('quit');
          })
          .then(function(response){
            actualFrame = null;
            $scope.currentFrame = null;
            $scope.started = false;
            return response;
          });
      }
    };

    $scope.$on('$destroy', function(){
      _this.quit();
    });
  });