angular.module('md.notebook', ['ipyng', 'md.codecell', 'ngMaterial', 'ng.lodash'])
  .directive('mdNotebook', function(_, $timeout, $q){
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
        scope.cmPromises = {};
        if(!scope.commands) {
          scope.commands = {};
        }
        var commands = scope.commands;
        scope.execute = {};
        var cmInstances = [];

        var newCell = function(){
          return {guid: _.uniqueId()};
        };

        commands.insertAbove = function(){
          var index = scope.selected;
          if(index === undefined) index = 0;
          commands.insert(index);
        };

        commands.insertBelow = function(){
          if(scope.selected === undefined) commands.insert(0);
          else commands.insert(scope.selected + 1);
        };

        commands.insert = function(index){
          scope.notebook.cells.splice(index, 0, newCell());
          loadCodeMirrors();
        };

        commands.editMode = function(){
          $timeout(function(){
            getCodeMirror(scope.selected)
              .then(function(cm){
                cm.focus();
              });
          });
        };

        commands.commandMode = function(){
          $timeout(function(){
            getCodeMirror(scope.selected)
              .then(function(cm){
                cm.getInputField().blur();
                element.find('md-content')[0].focus();
              });
          });
        };

        commands.selectCell = function(index) {
          if(index == scope.notebook.cells.length){
            commands.insertBelow();
          }
          scope.selected = index;
        };

        ///// initialize notebook state

        // default notebook if not provided
        if(!scope.notebook) {
          scope.notebook = {
            cells: [],
            metadata: {
              language_info: kernel.language_info
            },
            nbformat: 4,
            nbformat_minor: 0
          };
        }

        // Setup a guid for each cell
        _.forEach(scope.notebook.cells, function(cell){
          cell.guid = _.uniqueId();
        });

        // select the first cell
        commands.selectCell(0);

        // load code mirror instances
        loadCodeMirrors();

        element.bind('keydown', function(event){
          scope.$apply(function(){
            console.log(event.keyCode);
            if(event.keyCode == 13 && (event.shiftKey || event.ctrlKey || event.altKey)){
              handleExecute(event);
            }
            else{
              var cmInstance = cmInstances[scope.selected];
              if(cmInstance.hasFocus()) handleEditMode(event, cmInstance);
              else handleCommandMode(event, cmInstance);
            }
          });
        });

        function getCodeMirror (index){
          if(index === undefined) index = scope.selected;
          var deferred = $q.defer();
          // In case the cell was just created, insert a timeout
          // before getting CodeMirror promise to ensure cell
          // is created.
          $timeout(function(){
            if(index === undefined) index = scope.selected;
            scope.cmPromises[index]
              .then(function(cm){
                deferred.resolve(cm);
              });
          });
          return deferred.promise;
        }

        // load all code mirror instances
        function loadCodeMirrors () {
          $timeout(function(){
            $q.all(_.map(_.range(scope.notebook.cells.length), getCodeMirror))
              .then(function(result){
                cmInstances = result;
              });
          });
        }

        function handleEditMode (event, cm) {
          if(event.keyCode == 27) { // esc
            event.preventDefault();
            commands.commandMode();
          }
        }

        function handleCommandMode (event, cm){
          var key = event.keyCode;
          if(key == 13){ // enter
            event.preventDefault();
            commands.editMode();
          }
          else if(key == 38 || key == 75) { // up or k
            if(scope.selected > 0){
              commands.selectCell(scope.selected - 1);
            }
          }
          else if(key == 40 || key == 74) { // down or j
            if(scope.selected < scope.notebook.cells.length - 1){
              commands.selectCell(scope.selected + 1);
            }
          }
          else if(key == 88) { // x
            commands.cut();
          }
          else if(key == 86) { // v
            commands.paste();
          }
          else if(key == 90) { // v
            commands.undo();
          }
          else if(key == 65) { // a
            commands.insertAbove();
          }
          else if(key == 66) { // b
            commands.insertBelow();
          }
          else if(key == 67) { // c
            commands.copy();
          }
          else if(key == 77) { // m
            commands.merge();
          }
        }

        function handleExecute (event) {
          event.preventDefault();
          scope.execute[scope.selected]();
          cmInstances[scope.selected].getInputField().blur();
          if(event.shiftKey) {
            commands.selectCell(scope.selected + 1);
          }
          else if(event.altKey) {
            commands.insert();
            commands.selectCell(scope.selected + 1);
          }
          commands.commandMode();
        }
      }
    };
  });