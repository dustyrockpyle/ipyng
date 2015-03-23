angular.module('ipy.debugger', ['ipyng', 'ng.lodash', 'ui.codemirror'])
  .directive('ipdb', function (ipyKernel, $q) {
    return {
      templateUrl: 'debugger.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
      },
      link: function (scope, element, attrs, kernel) {
        scope.current = 0;
        scope.expressions = [];
        var stdoutDeferreds = [];
        var stdoutHandler = function(stream){
          if(stdoutDeferreds.length) stdoutDeferreds.pop().resolve(stream);
        };
        /*var promise = kernel.execute(
         "def f(x):\n" +
         "    if x == 5:\n" +
         "        raise ValueError(5)\n" +
         "    return f(x+1)\n" +
         "f(1)\n"
         )
         .then(function() {
         return kernel.executeStdinSilent('import pdb\npdb.pm()', stdoutHandler);
         })*/
        var promise = kernel.executeStdinSilent('import pdb\npdb.pm()', stdoutHandler)
          .then(function(response){
            return response.reply('where');
          })
          .then(function(response){
            scope.stack = _(response.stdout[0])
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

        scope.$watch('current', function(newFrame, oldFrame){
          var diff = newFrame - oldFrame;
          promise = promise
            .then(function(response){
              if(diff > 0) return response.reply('u ' + diff);
              else return response.reply('d ' + (-diff));
            })
            .then(function(response){
              getLocals();
              getArgs();
              getFile();
              return response;
            });
        });

        var getLocals = function(){
          promise = promise
            .then(function(response){
              return response.reply('p ' + 'list(locals().keys())');
            })
            .then(function(response) {
              var result = response.stdout[0].replace(/'/g, '"');
              scope.locals = JSON.parse(result); // Ugly.
              return response;
            });
        };

        var getArgs = function(){
          promise = promise
            .then(function(response){
              return response.reply('a');
            })
            .then(function(response){
              scope.args = _(_.trim(response.stdout[0]))
                .split('\n') // split to lines
                .invoke('split', ' = ') // split to name value pairs
                .map(_.curry(_.zipObject)(['name', 'value'])) // make name, value objects
                .value();
              return response;
            });
        };

        var getFile = function(){
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
              var currentLine = source[scope.stack[scope.current].lineNumber - 1];
              source[scope.stack[scope.current].lineNumber - 1] = currentLine.substr(2);
              scope.source = source.join('\n'); // remake the text blob
              return response;
            });
        };

        var evaluate = function(expression){
          promise = promise
            .then(function(response){
              return response.reply('p ' + expression);
            })
            .then(function(response){
              scope.expressions[expression] = _.trim(response.stdout[0]);
              return response;
            });
        };

        scope.goToFrame = function(index) {
          scope.current = index;
        };

        scope.$on('$destroy', function(){
          promise
            .then(function(response){
              return response.reply('quit');
            });
        });
      }
    };
  })
;