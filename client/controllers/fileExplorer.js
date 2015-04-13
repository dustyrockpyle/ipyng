(function(angular){
  angular.module('ipy.fileExplorer', ['ipyng'])
    .controller('ipyFileExplorerCtrl', ipyFileExplorerCtrl);

  function ipyFileExplorerCtrl (kernel) {
    var self = this,
      dir_code = 'json.dumps([{"name": name, "isfile": os.path.isfile(name)} for name in os.listdir()])',
      curdir_code = 'json.dumps(os.path.abspath("."))';

    self.curdir = '';
    self.dir = [];
    self.upLevel = upLevel;
    self.navigate = navigate;
    self.read = read;

    kernel.executeSilent('import os; import json');
    updateDirectory();
    function updateDirectory () {
      return kernel.evaluate([dir_code, curdir_code])
        .then(function (result) {
          self.dir = JSON.parse(result[0].text.slice(1, -1));
          self.curdir = JSON.parse(result[1].text.slice(1, -1));
        });
    }

    function upLevel () {
      return navigate('..');
    }

    function navigate (path) {
      return kernel.executeSilent('os.chdir(r"' + path +'")')
        .then(updateDirectory)
    }

    function read (filename) {
      return kernel.evaluate('json.dumps(open(r"' + filename + '").read())');
    }
  }
})(angular);