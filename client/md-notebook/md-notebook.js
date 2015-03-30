angular.module('md.notebook', ['ipyng', 'md.codecell', 'ngMaterial'])
 .directive('mdNotebook', function(){
    return {
      templateUrl: 'md-notebook.tpl.html',
      restrict: 'E',
      require: '^kernel',
      scope: {
        notebook: '=?',
        commands: '=?',
        selected: '=?'
      },
      link: function (scope, element, attrs, kernel) {
        scope.selected = 0;
        if(!scope.commands) {
          scope.commands = {};
        }
        var commands = scope.commands;

        commands.insert = function(){
          if(!scope.selected) {
            scope.notebook.cells.push({});
          }
        };

        commands.cut = function(){

        };

        commands.paste = function(){

        };

        commands.selectCell = function(index) {
          scope.selected = index;
        };

        if(!scope.notebook) {
          scope.notebook = {
            cells: [],
            metadata: {
              language_info: kernel.language_info
            },
            nbformat: 4,
            nbformat_minor: 0
          };
          commands.insert();
          commands.insert();
          commands.insert();
        }

        //_.forEach(scope.notebook.cells, function(cell){
        //  cell.selected = false;
        //});


        scope.$watch(function(){
          return scope.notebook.cells[1].execution_count;
        }, function(output){
          //commands.selectCell(selected + 1);
          scope.selected += 1;
        });
      }
    };
  })
  .directive('slide', function(){
    return {
      restrict: 'A',
      link: function (scope, element, attrs, kernel) {
        var getHeight = function(){
          return element.height();
        };
        scope.$watch(getHeight, function(height){
          console.log(height);
        });
      }
    };
  });